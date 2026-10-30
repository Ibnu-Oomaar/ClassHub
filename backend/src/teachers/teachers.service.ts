import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { hashPassword } from '../common/utils/password.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { FilesService } from '../files/files.service';
import { FileCategory, FileOwnerType } from '../files/types/file.types.interface';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { Teacher } from './teachers.entity';
import { TeacherProfileView, TeacherSubjectRef, TeacherSummaryView } from './types/teacher.types.interface';

const SORTABLE = {
  fullName: 'user.fullName',
  status: 'user.status',
  createdAt: 'teacher.createdAt',
};

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateTeacherDto, actor: AuthenticatedUser): Promise<TeacherProfileView> {
    if (!dto.username && !dto.email) {
      throw new BadRequestException('Provide a username or an email so the teacher can sign in.');
    }

    const created = await this.teachers.manager.transaction(async (manager) => {
      const user = await this.users.createUser(manager, {
        role: Role.TEACHER,
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        password: dto.password,
        status: dto.status ?? AccountStatus.ACTIVE,
      });

      if (dto.profilePhotoFileId) {
        await this.files.assertLinkableUpload(dto.profilePhotoFileId, actor, FileCategory.PROFILE_PHOTO, manager);
      }

      const repository = manager.getRepository(Teacher);
      const teacher = await repository.save(
        repository.create({
          userId: user.id,
          gender: dto.gender ?? null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          qualification: dto.qualification ?? null,
          notes: dto.notes ?? null,
          profilePhotoId: dto.profilePhotoFileId ?? null,
        }),
      );

      if (dto.profilePhotoFileId) {
        await this.files.attach(dto.profilePhotoFileId, FileOwnerType.USER_PROFILE, teacher.id, manager);
      }
      return teacher;
    });

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_CREATED,
      entityType: 'Teacher',
      entityId: created.id,
      summary: `Created teacher account for ${normalizeFullName(dto.fullName)}`,
    });

    return this.getProfile(created.id);
  }

  async list(query: TeacherQueryDto, actor: AuthenticatedUser): Promise<Paginated<TeacherProfileView | TeacherSummaryView>> {
    const qb = this.baseQuery(!!query.onlyDeleted || !!query.includeDeleted);

    if (query.onlyDeleted) {
      qb.andWhere('teacher.deletedAt IS NOT NULL');
    }

    if (query.status) qb.andWhere('user.status = :status', { status: query.status });
    if (query.subjectId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.teacher_id = teacher.id AND ts.subject_id = :subjectId)`,
        { subjectId: query.subjectId },
      );
    }
    if (query.unassignedOnly) {
      qb.andWhere(`NOT EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.teacher_id = teacher.id)`);
    }
    if (query.search) {
      qb.andWhere(
        `(user.fullName ILIKE :search ESCAPE '\\' OR user.username ILIKE :search ESCAPE '\\' OR user.email ILIKE :search ESCAPE '\\')`,
        { search: `%${escapeLike(query.search)}%` },
      );
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'fullName'), query.sortBy ? query.sortOrder : 'ASC')
      .addOrderBy('teacher.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const subjectsByTeacher = await this.loadSubjects(rows.map((row) => row.id));
    const items = rows.map((row) => this.toProfile(row, subjectsByTeacher.get(row.id) ?? []));
    return buildPaginated(items, total, query.page, query.limit);
  }

  async getProfile(id: string): Promise<TeacherProfileView> {
    const teacher = await this.findOrFail(id, { withDeleted: true });
    const subjects = (await this.loadSubjects([id])).get(id) ?? [];
    return this.toProfile(teacher, subjects);
  }

  /** The signed-in teacher's own profile. */
  async findMe(actor: AuthenticatedUser): Promise<Omit<TeacherProfileView, 'notes'>> {
    if (!actor.teacherProfileId) {
      throw new ForbiddenException('This account has no teacher profile.');
    }
    const { notes: _notes, ...profile } = await this.getProfile(actor.teacherProfileId);
    return profile;
  }

  async update(id: string, dto: UpdateTeacherDto, actor: AuthenticatedUser): Promise<TeacherProfileView> {
    let replacedPhotoId: string | null = null;
    let passwordChanged = false;

    await this.teachers.manager.transaction(async (manager) => {
      const teacher = await this.findOrFail(id, { manager });
      const user = await this.users.findByIdOrFail(teacher.userId, manager);
      const userPatch: Partial<User> = {};
      const teacherPatch: Partial<Teacher> = {};

      if (dto.fullName !== undefined) userPatch.fullName = normalizeFullName(dto.fullName);

      if (dto.username !== undefined || dto.email !== undefined) {
        const username = dto.username === undefined ? user.username : dto.username?.toLowerCase() ?? null;
        const email = dto.email === undefined ? user.email : dto.email?.toLowerCase() ?? null;
        if (!username && !email) {
          throw new BadRequestException('A teacher needs a username or an email to sign in.');
        }
        await this.users.assertIdentifiersAvailable(manager, { username, email }, user.id);
        userPatch.username = username;
        userPatch.email = email;
      }

      if (dto.password !== undefined) {
        userPatch.passwordHash = await hashPassword(dto.password);
        userPatch.tokenVersion = user.tokenVersion + 1;
        userPatch.failedLoginAttempts = 0;
        userPatch.lockedUntil = null;
        passwordChanged = true;
      }

      if (dto.gender !== undefined) teacherPatch.gender = dto.gender ?? null;
      if (dto.phone !== undefined) teacherPatch.phone = dto.phone ?? null;
      if (dto.address !== undefined) teacherPatch.address = dto.address ?? null;
      if (dto.qualification !== undefined) teacherPatch.qualification = dto.qualification ?? null;
      if (dto.notes !== undefined) teacherPatch.notes = dto.notes ?? null;

      if (dto.profilePhotoFileId !== undefined && dto.profilePhotoFileId !== teacher.profilePhotoId) {
        if (dto.profilePhotoFileId) {
          await this.files.assertLinkableUpload(dto.profilePhotoFileId, actor, FileCategory.PROFILE_PHOTO, manager);
          await this.files.attach(dto.profilePhotoFileId, FileOwnerType.USER_PROFILE, teacher.id, manager);
        }
        replacedPhotoId = teacher.profilePhotoId;
        teacherPatch.profilePhotoId = dto.profilePhotoFileId ?? null;
      }

      if (Object.keys(userPatch).length > 0) await manager.getRepository(User).update({ id: user.id }, userPatch);
      if (Object.keys(teacherPatch).length > 0) await manager.getRepository(Teacher).update({ id: teacher.id }, teacherPatch);
    });

    if (replacedPhotoId) {
      await this.files.discard(replacedPhotoId);
    }

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_UPDATED,
      entityType: 'Teacher',
      entityId: id,
      summary: passwordChanged ? 'Updated teacher record and reset password' : 'Updated teacher record',
      details: { fields: Object.keys(dto).filter((field) => field !== 'password') },
    });

    return this.getProfile(id);
  }

  async updateStatus(id: string, status: AccountStatus, actor: AuthenticatedUser): Promise<TeacherProfileView> {
    const teacher = await this.findOrFail(id);
    const previous = teacher.user.status;

    await this.users.setStatus(teacher.userId, status);

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_STATUS_CHANGED,
      entityType: 'Teacher',
      entityId: id,
      summary: `Changed ${teacher.user.fullName} from ${previous} to ${status}`,
      details: { from: previous, to: status },
    });

    return this.getProfile(id);
  }

  /** Soft delete: the account can no longer sign in; assignments, marks and feedback stay intact. */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const teacher = await this.findOrFail(id);

    await this.teachers.manager.transaction(async (manager) => {
      await manager.getRepository(TeacherSubject).delete({ teacherId: id });
      await manager.getRepository(Teacher).softDelete({ id });
      await this.users.softDelete(teacher.userId, manager);
    });

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_DELETED,
      entityType: 'Teacher',
      entityId: id,
      summary: `Removed teacher ${teacher.user.fullName} and their subject assignments`,
    });

    return { deleted: true };
  }

  async restore(id: string, actor: AuthenticatedUser): Promise<TeacherProfileView> {
    const teacher = await this.findOrFail(id, { withDeleted: true });
    if (!teacher.deletedAt) {
      throw new BadRequestException('This teacher has not been removed.');
    }

    await this.teachers.manager.transaction(async (manager) => {
      await manager.getRepository(Teacher).restore({ id });
      await this.users.restore(teacher.userId, manager);
    });

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_RESTORED,
      entityType: 'Teacher',
      entityId: id,
      summary: `Restored teacher ${teacher.user.fullName}. Subject assignments must be added again.`,
    });

    return this.getProfile(id);
  }

  async getPhoto(id: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    if (actor.role === Role.TEACHER && actor.teacherProfileId !== id) {
      throw new ForbiddenException('You can only view your own photo.');
    }
    const teacher = await this.findOrFail(id);
    if (!teacher.profilePhotoId) {
      throw new NotFoundException('This teacher has no profile photo.');
    }
    const record = await this.files.getRecord(teacher.profilePhotoId);
    return this.files.stream(record, { inline: true });
  }

  async getMyPhoto(actor: AuthenticatedUser): Promise<StreamableFile> {
    if (!actor.teacherProfileId) {
      throw new ForbiddenException('This account has no teacher profile.');
    }
    return this.getPhoto(actor.teacherProfileId, actor);
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * IMPORTANT: TypeORM decides whether a JOIN skips soft-deleted rows at the moment the join is
   * added, so `withDeleted()` has to be called BEFORE `innerJoinAndSelect`.
   */
  private baseQuery(withDeleted = false, manager?: EntityManager): SelectQueryBuilder<Teacher> {
    const repository = manager ? manager.getRepository(Teacher) : this.teachers;
    const qb = repository.createQueryBuilder('teacher');
    if (withDeleted) qb.withDeleted();
    return qb.innerJoinAndSelect('teacher.user', 'user');
  }

  private async findOrFail(id: string, options: { withDeleted?: boolean; manager?: EntityManager } = {}): Promise<Teacher> {
    const teacher = await this.baseQuery(options.withDeleted ?? false, options.manager)
      .where('teacher.id = :id', { id })
      .getOne();
    if (!teacher) {
      throw new NotFoundException('Teacher not found.');
    }
    return teacher;
  }

  private async loadSubjects(teacherIds: string[]): Promise<Map<string, TeacherSubjectRef[]>> {
    const result = new Map<string, TeacherSubjectRef[]>();
    if (teacherIds.length === 0) return result;

    const rows = await this.teacherSubjects.find({
      where: { teacherId: In(teacherIds) },
      relations: { subject: true },
      order: { createdAt: 'ASC' },
    });

    for (const row of rows) {
      const list = result.get(row.teacherId) ?? [];
      list.push({
        assignmentId: row.id,
        subjectId: row.subjectId,
        subjectName: row.subject.name,
        subjectCode: row.subject.code,
        subjectActive: row.subject.isActive,
      });
      result.set(row.teacherId, list);
    }
    return result;
  }

  private toProfile(teacher: Teacher, subjects: TeacherSubjectRef[]): TeacherProfileView {
    return {
      id: teacher.id,
      userId: teacher.userId,
      fullName: teacher.user.fullName,
      username: teacher.user.username,
      email: teacher.user.email,
      status: teacher.user.status,
      hasPhoto: teacher.profilePhotoId !== null,
      subjects,
      createdAt: teacher.createdAt,
      deletedAt: teacher.deletedAt,
      gender: teacher.gender,
      phone: teacher.phone,
      address: teacher.address,
      qualification: teacher.qualification,
      notes: teacher.notes,
      lastLoginAt: teacher.user.lastLoginAt,
      updatedAt: teacher.updatedAt,
    };
  }
}
