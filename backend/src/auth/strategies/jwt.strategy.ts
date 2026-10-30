import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { loadAppConfig } from '../../config/app.config';
import { Student } from '../../students/students.entity';
import { Teacher } from '../../teachers/teachers.entity';
import { User } from '../../users/users.entity';
import { JwtPayload } from '../types/auth.types.interface';

/**
 * Verifies the token signature, then re-checks the account in the database on EVERY request:
 * the account must still exist (not soft-deleted), be ACTIVE, and carry the same token version.
 * That is what makes suspending a student or resetting a password take effect immediately.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadAppConfig(config).jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findOne({ where: { id: payload.sub } });

    if (!user || user.status !== AccountStatus.ACTIVE || user.tokenVersion !== payload.tv || user.role !== payload.role) {
      throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    }

    let teacherProfileId: string | null = null;
    let studentProfileId: string | null = null;

    if (user.role === Role.TEACHER) {
      const teacher = await this.teachers.findOne({ where: { userId: user.id }, select: { id: true } });
      if (!teacher) throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
      teacherProfileId = teacher.id;
    } else if (user.role === Role.STUDENT) {
      const student = await this.students.findOne({ where: { userId: user.id }, select: { id: true } });
      if (!student) throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
      studentProfileId = student.id;
    }

    return { id: user.id, role: user.role, fullName: user.fullName, teacherProfileId, studentProfileId };
  }
}
