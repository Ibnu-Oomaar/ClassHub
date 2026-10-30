import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { FilesService } from '../files/files.service';
import { FileCategory, FileOwnerType } from '../files/types/file.types.interface';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Student } from './students.entity';
import { StudentProfileView, StudentSelfView, StudentSummaryView } from './types/student.types.interface';

const SORTABLE = {
  fullName: 'user.fullName',
  studentId: 'student.studentId',
  status: 'user.status',
  createdAt: 'student.createdAt',
};

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateStudentDto, actor: AuthenticatedUser): Promise<StudentProfileView> {
    this.assertDateOfBirth(dto.dateOfBirth);

    const created = await this.students.manager.transaction(async (manager) => {
      await this.assertStudentIdAvailable(manager, dto.studentId);

      const user = await this.users.createUser(manager, {
        role: Role.STUDENT,
        fullName: dto.fullName,
        status: dto.status ?? AccountStatus.ACTIVE,
      });

      if (dto.profilePhotoFileId) {
        await this.files.assertLinkableUpload(dto.profilePhotoFileId, actor, FileCategory.PROFILE_PHOTO, manager);
      }

      const repository = manager.getRepository(Student);
      const student = await repository.save(
        repository.create({
          userId: user.id,
          studentId: dto.studentId,
          gender: dto.gender ?? null,
          dateOfBirth: dto.dateOfBirth ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          notes: dto.notes ?? null,
          profilePhotoId: dto.profilePhotoFileId ?? null,
        }),
      );

      if (dto.profilePhotoFileId) {
        await this.files.attach(dto.profilePhotoFileId, FileOwnerType.USER_PROFILE, student.id, manager);
      }
      return student;
    });

    await this.audit.record({
      actor,
      action: AuditAction.STUDENT_CREATED,
      entityType: 'Student',
      entityId: created.id,
      summary: `Registered student ${normalizeFullName(dto.fullName)} (${dto.studentId})`,
    });

    return this.getProfile(created.id);
  }

  async list(query: StudentQueryDto, actor: AuthenticatedUser): Promise<Paginated<StudentProfileView | StudentSummaryView>> {
    const isClassMaster = actor.role === Role.CLASS_MASTER;
    const onlyDeleted = isClassMaster && !!query.onlyDeleted;
    const qb = this.baseQuery(onlyDeleted || (isClassMaster && !!query.includeDeleted));

    if (onlyDeleted) {
      qb.andWhere('student.deletedAt IS NOT NULL');
    }

    if (query.status) qb.andWhere('user.status = :status', { status: query.status });
    if (query.gender) qb.andWhere('student.gender = :gender', { gender: query.gender });
    if (query.search) {
      qb.andWhere(`(user.fullName ILIKE :search ESCAPE '\\' OR student.studentId ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'fullName'), query.sortBy ? query.sortOrder : 'ASC')
      .addOrderBy('student.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((row) => (isClassMaster ? this.toProfile(row) : this.toSummary(row)));
    return buildPaginated(items, total, query.page, query.limit);
  }

  /** Full record, Class Master only (controllers enforce the role). */
  async getProfile(id: string): Promise<StudentProfileView> {
    return this.toProfile(await this.findOrFail(id, { withDeleted: true }));
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<StudentProfileView | StudentSummaryView> {
    if (actor.role === Role.CLASS_MASTER) {
      return this.getProfile(id);
    }
    return this.toSummary(await this.findOrFail(id));
  }

  async findMe(actor: AuthenticatedUser): Promise<StudentSelfView> {
    const student = await this.findOrFail(this.requireStudentProfile(actor));
    const { notes: _notes, lastLoginAt: _lastLoginAt, ...profile } = this.toProfile(student);
    return { ...profile, className: await this.settings.getClassName() };
  }

  async update(id: string, dto: UpdateStudentDto, actor: AuthenticatedUser): Promise<StudentProfileView> {
    if (dto.dateOfBirth !== undefined) this.assertDateOfBirth(dto.dateOfBirth);

    let replacedPhotoId: string | null = null;

    await this.students.manager.transaction(async (manager) => {
      const student = await this.findOrFail(id, { manager });
      const patch: Partial<Student> = {};

      if (dto.studentId !== undefined && dto.studentId !== student.studentId) {
        await this.assertStudentIdAvailable(manager, dto.studentId, student.id);
        patch.studentId = dto.studentId;
      }
      if (dto.gender !== undefined) patch.gender = dto.gender ?? null;
      if (dto.dateOfBirth !== undefined) patch.dateOfBirth = dto.dateOfBirth ?? null;
      if (dto.phone !== undefined) patch.phone = dto.phone ?? null;
      if (dto.email !== undefined) patch.email = dto.email ?? null;
      if (dto.address !== undefined) patch.address = dto.address ?? null;
      if (dto.notes !== undefined) patch.notes = dto.notes ?? null;

      if (dto.profilePhotoFileId !== undefined && dto.profilePhotoFileId !== student.profilePhotoId) {
        if (dto.profilePhotoFileId) {
          await this.files.assertLinkableUpload(dto.profilePhotoFileId, actor, FileCategory.PROFILE_PHOTO, manager);
          await this.files.attach(dto.profilePhotoFileId, FileOwnerType.USER_PROFILE, student.id, manager);
        }
        replacedPhotoId = student.profilePhotoId;
        patch.profilePhotoId = dto.profilePhotoFileId ?? null;
      }

      if (dto.fullName !== undefined) {
        await manager.getRepository(User).update({ id: student.userId }, { fullName: normalizeFullName(dto.fullName) });
      }
      if (Object.keys(patch).length > 0) {
        await manager.getRepository(Student).update({ id: student.id }, patch);
      }
    });

    // The previous photo is only deleted after the new state is safely committed.
    if (replacedPhotoId) {
      await this.files.discard(replacedPhotoId);
    }

    await this.audit.record({
      actor,
      action: AuditAction.STUDENT_UPDATED,
      entityType: 'Student',
      entityId: id,
      summary: 'Updated student record',
      details: { fields: Object.keys(dto) },
    });

    return this.getProfile(id);
  }

  async updateStatus(id: string, status: AccountStatus, actor: AuthenticatedUser): Promise<StudentProfileView> {
    const student = await this.findOrFail(id);
    const previous = student.user.status;

    await this.users.setStatus(student.userId, status);

    await this.audit.record({
      actor,
      action: AuditAction.STUDENT_STATUS_CHANGED,
      entityType: 'Student',
      entityId: id,
      summary: `Changed ${student.user.fullName} from ${previous} to ${status}`,
      details: { from: previous, to: status },
    });

    return this.getProfile(id);
  }

  /** Soft delete: the account can no longer sign in, but marks and submissions are preserved. */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const student = await this.findOrFail(id);

    await this.students.manager.transaction(async (manager) => {
      await manager.getRepository(Student).softDelete({ id });
      await this.users.softDelete(student.userId, manager);
    });

    await this.audit.record({
      actor,
      action: AuditAction.STUDENT_DELETED,
      entityType: 'Student',
      entityId: id,
      summary: `Removed student ${student.user.fullName} (${student.studentId})`,
    });

    return { deleted: true };
  }

  async restore(id: string, actor: AuthenticatedUser): Promise<StudentProfileView> {
    const student = await this.findOrFail(id, { withDeleted: true });
    if (!student.deletedAt) {
      throw new BadRequestException('This student has not been removed.');
    }

    await this.students.manager.transaction(async (manager) => {
      await manager.getRepository(Student).restore({ id });
      await this.users.restore(student.userId, manager);
    });

    await this.audit.record({
      actor,
      action: AuditAction.STUDENT_RESTORED,
      entityType: 'Student',
      entityId: id,
      summary: `Restored student ${student.user.fullName} (${student.studentId})`,
    });

    return this.getProfile(id);
  }

  /** Profile photo. Class Master and teachers may view any; a student only their own. */
  async getPhoto(id: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    if (actor.role === Role.STUDENT && actor.studentProfileId !== id) {
      throw new ForbiddenException('You can only view your own photo.');
    }
    const student = await this.findOrFail(id);
    if (!student.profilePhotoId) {
      throw new NotFoundException('This student has no profile photo.');
    }
    const record = await this.files.getRecord(student.profilePhotoId);
    return this.files.stream(record, { inline: true });
  }

  async getMyPhoto(actor: AuthenticatedUser): Promise<StreamableFile> {
    return this.getPhoto(this.requireStudentProfile(actor), actor);
  }

  // ---------------------------------------------------------------------------------------------

  private requireStudentProfile(actor: AuthenticatedUser): string {
    if (!actor.studentProfileId) {
      throw new ForbiddenException('This account has no student profile.');
    }
    return actor.studentProfileId;
  }

  /**
   * IMPORTANT: TypeORM decides whether a JOIN skips soft-deleted rows at the moment the join is
   * added, so `withDeleted()` has to be called BEFORE `innerJoinAndSelect`. Calling it afterwards
   * only lifts the filter on the main table and removed students would never be found.
   */
  private baseQuery(withDeleted = false, manager?: EntityManager): SelectQueryBuilder<Student> {
    const repository = manager ? manager.getRepository(Student) : this.students;
    const qb = repository.createQueryBuilder('student');
    if (withDeleted) qb.withDeleted();
    return qb.innerJoinAndSelect('student.user', 'user');
  }

  private async findOrFail(
    id: string,
    options: { withDeleted?: boolean; manager?: EntityManager } = {},
  ): Promise<Student> {
    const student = await this.baseQuery(options.withDeleted ?? false, options.manager)
      .where('student.id = :id', { id })
      .getOne();
    if (!student) {
      throw new NotFoundException('Student not found.');
    }
    return student;
  }

  /** Student IDs are unique across all students, including removed ones. */
  private async assertStudentIdAvailable(manager: EntityManager, studentId: string, excludeId?: string): Promise<void> {
    const qb = manager
      .getRepository(Student)
      .createQueryBuilder('student')
      .withDeleted()
      .select(['student.id', 'student.deletedAt'])
      .where('student.studentId = :studentId', { studentId });
    if (excludeId) qb.andWhere('student.id <> :excludeId', { excludeId });

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? 'That Student ID belongs to a removed student. Restore that student instead.'
          : 'That Student ID is already registered.',
      );
    }
  }

  private assertDateOfBirth(value: string | null | undefined): void {
    if (!value) return;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() || date.getUTCFullYear() < 1900) {
      throw new BadRequestException('Date of birth must be a real date in the past.');
    }
  }

  private toSummary(student: Student): StudentSummaryView {
    return {
      id: student.id,
      userId: student.userId,
      fullName: student.user.fullName,
      studentId: student.studentId,
      gender: student.gender,
      status: student.user.status,
      hasPhoto: student.profilePhotoId !== null,
      registeredAt: student.createdAt,
      deletedAt: student.deletedAt,
    };
  }

  private toProfile(student: Student): StudentProfileView {
    return {
      ...this.toSummary(student),
      dateOfBirth: student.dateOfBirth,
      phone: student.phone,
      email: student.email,
      address: student.address,
      notes: student.notes,
      lastLoginAt: student.user.lastLoginAt,
      updatedAt: student.updatedAt,
    };
  }
}
