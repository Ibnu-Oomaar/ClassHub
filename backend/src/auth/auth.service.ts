import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { nameKey, normalizeStudentId } from '../common/utils/name.util';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../common/utils/password.util';
import { loadAppConfig } from '../config/app.config';
import { Student } from '../students/students.entity';
import { Teacher } from '../teachers/teachers.entity';
import { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { GENERIC_LOGIN_FAILURE, JwtPayload, LoginResponse } from './types/auth.types.interface';

@Injectable()
export class AuthService {
  private readonly maxFailedAttempts: number;
  private readonly lockMinutes: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditLogsService,
    config: ConfigService,
  ) {
    const app = loadAppConfig(config);
    this.maxFailedAttempts = app.loginMaxFailedAttempts;
    this.lockMinutes = app.loginLockMinutes;
  }

  /** Class Master and Teacher sign-in: username or email + password. */
  async staffLogin(role: Role.CLASS_MASTER | Role.TEACHER, identifier: string, password: string, ip: string | null): Promise<LoginResponse> {
    const found = await this.users.findStaffByIdentifier(identifier);
    const user = found && found.role === role ? found : null;

    if (!user || !user.passwordHash) {
      // Spend the same time as a real password check so response timing does not reveal accounts.
      await burnPasswordCheck(password);
      await this.auditFailure(role, identifier, ip);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    const passwordMatches = await verifyPassword(user.passwordHash, password);
    const usable = this.isUsable(user);

    if (!passwordMatches || !usable) {
      if (usable) {
        await this.registerFailedAttempt(user, ip);
      } else {
        await this.auditFailure(role, identifier, ip, user.id);
      }
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    return this.completeLogin(user, ip);
  }

  /**
   * Student sign-in: Full Name + Student ID, nothing else. Names are compared ignoring case and
   * extra spaces. Every failure returns the same message; repeated failures lock the account
   * temporarily, and the global rate limiter slows guessing across accounts.
   */
  async studentLogin(dto: StudentLoginDto, ip: string | null): Promise<LoginResponse> {
    const studentCode = normalizeStudentId(dto.studentId);
    const student = await this.students
      .createQueryBuilder('student')
      .innerJoinAndSelect('student.user', 'user')
      .where('student.studentId = :studentCode', { studentCode })
      .getOne();

    if (!student) {
      await this.auditFailure(Role.STUDENT, studentCode, ip);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    const user = student.user;
    const nameMatches = this.sameName(user.fullName, dto.fullName);
    const usable = this.isUsable(user);

    if (!nameMatches || !usable) {
      if (usable) {
        await this.registerFailedAttempt(user, ip);
      } else {
        await this.auditFailure(Role.STUDENT, studentCode, ip, user.id);
      }
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    return this.completeLogin(user, ip);
  }

  /** Staff change their own password. All older tokens stop working; a fresh one is returned. */
  async changePassword(current: AuthenticatedUser, dto: ChangePasswordDto): Promise<LoginResponse> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: current.id })
      .getOne();

    if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('The current password is not correct.');
    }

    await this.users.setPasswordHash(user.id, await hashPassword(dto.newPassword));

    await this.audit.record({
      actor: current,
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user.id,
      summary: 'Changed own password',
    });

    const refreshed = await this.users.findByIdOrFail(user.id);
    return this.issueToken(refreshed);
  }

  // ---------------------------------------------------------------------------------------------

  private isUsable(user: User): boolean {
    if (user.status !== AccountStatus.ACTIVE) return false;
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return false;
    return true;
  }

  private sameName(stored: string, supplied: string): boolean {
    const a = createHash('sha256').update(nameKey(stored)).digest();
    const b = createHash('sha256').update(nameKey(supplied)).digest();
    return timingSafeEqual(a, b);
  }

  private async completeLogin(user: User, ip: string | null): Promise<LoginResponse> {
    await this.userRepository.update({ id: user.id }, { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });

    const response = await this.issueToken(user);

    await this.audit.record({
      actor: { id: user.id, fullName: user.fullName, role: user.role },
      action: AuditAction.AUTH_LOGIN,
      entityType: 'User',
      entityId: user.id,
      summary: `${user.fullName} signed in`,
      ipAddress: ip,
    });

    return response;
  }

  /** Atomic counter so parallel guesses cannot slip past the limit. */
  private async registerFailedAttempt(user: User, ip: string | null): Promise<void> {
    await this.userRepository.increment({ id: user.id }, 'failedLoginAttempts', 1);
    const { failedLoginAttempts } = await this.users.findByIdOrFail(user.id);

    await this.auditFailure(user.role, user.fullName, ip, user.id);

    if (failedLoginAttempts >= this.maxFailedAttempts) {
      const lockedUntil = new Date(Date.now() + this.lockMinutes * 60_000);
      await this.userRepository.update({ id: user.id }, { lockedUntil, failedLoginAttempts: 0 });
      await this.audit.record({
        actor: null,
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        entityType: 'User',
        entityId: user.id,
        summary: `${user.fullName} was locked for ${this.lockMinutes} minutes after repeated failed sign-ins`,
        ipAddress: ip,
      });
    }
  }

  private auditFailure(role: Role, subject: string, ip: string | null, userId?: string): Promise<void> {
    return this.audit.record({
      actor: null,
      action: AuditAction.AUTH_LOGIN_FAILED,
      entityType: 'User',
      entityId: userId ?? null,
      summary: `Failed ${role.toLowerCase().replace('_', ' ')} sign-in`,
      details: { attempted: subject.slice(0, 80) },
      ipAddress: ip,
    });
  }

  private async issueToken(user: User): Promise<LoginResponse> {
    const payload: JwtPayload = { sub: user.id, role: user.role, tv: user.tokenVersion };
    const accessToken = await this.jwt.signAsync(payload);
    const decoded = this.jwt.decode<{ exp: number }>(accessToken);

    const studentCode =
      user.role === Role.STUDENT
        ? (await this.students.findOne({ where: { userId: user.id }, select: { id: true, studentId: true, profilePhotoId: true } }))
        : null;
    const teacher =
      user.role === Role.TEACHER
        ? (await this.teachers.findOne({ where: { userId: user.id }, select: { id: true, profilePhotoId: true } }))
        : null;

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: new Date(decoded.exp * 1000),
      user: {
        ...this.users.toView(user),
        studentCode: studentCode?.studentId ?? null,
        studentProfileId: studentCode?.id ?? null,
        teacherProfileId: teacher?.id ?? null,
        hasPhoto: (studentCode?.profilePhotoId ?? teacher?.profilePhotoId ?? null) !== null,
      },
    };
  }
}
