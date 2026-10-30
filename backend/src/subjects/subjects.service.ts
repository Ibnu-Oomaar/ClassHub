import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { nameKey, normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { SubjectQueryDto } from './dto/subject-query.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from './subjects.entity';
import { SubjectTeacherRef, SubjectView } from './types/subject.types.interface';

const SORTABLE = {
  name: 'subject.name',
  code: 'subject.code',
  isActive: 'subject.isActive',
  createdAt: 'subject.createdAt',
};

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateSubjectDto, actor: AuthenticatedUser): Promise<SubjectView> {
    const name = normalizeFullName(dto.name);
    await this.assertUnique(name, dto.code ?? null);

    const saved = await this.subjects.save(
      this.subjects.create({
        name,
        nameKey: nameKey(name),
        code: dto.code ?? null,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.audit.record({
      actor,
      action: AuditAction.SUBJECT_CREATED,
      entityType: 'Subject',
      entityId: saved.id,
      summary: `Created subject ${saved.name}`,
    });

    return this.findOne(saved.id, actor);
  }

  /**
   * Class Master: every subject. Teacher: only the subjects assigned to them.
   * Student: active subjects, with their teachers.
   */
  async list(query: SubjectQueryDto, actor: AuthenticatedUser): Promise<Paginated<SubjectView>> {
    const qb = this.subjects.createQueryBuilder('subject');

    if (actor.role === Role.TEACHER) {
      qb.where((sub) => {
        const inner = sub
          .subQuery()
          .select('1')
          .from(TeacherSubject, 'own')
          .where('own.subject_id = subject.id')
          .andWhere('own.teacher_id = :ownTeacherId')
          .getQuery();
        return `EXISTS ${inner}`;
      }).setParameter('ownTeacherId', actor.teacherProfileId);
    } else if (actor.role === Role.STUDENT) {
      qb.where('subject.isActive = true');
    } else if (query.isActive !== undefined) {
      qb.where('subject.isActive = :isActive', { isActive: query.isActive });
    }

    if (actor.role === Role.CLASS_MASTER) {
      if (query.teacherId) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = subject.id AND ts.teacher_id = :teacherId)`,
          { teacherId: query.teacherId },
        );
      }
      if (query.unassignedOnly) {
        qb.andWhere(`NOT EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = subject.id)`);
      }
    }

    if (query.search) {
      qb.andWhere(`(subject.name ILIKE :search ESCAPE '\\' OR subject.code ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'name'), query.sortBy ? query.sortOrder : 'ASC')
      .addOrderBy('subject.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const views = await this.toViews(rows, actor);
    return buildPaginated(views, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<SubjectView> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    if (actor.role === Role.TEACHER) {
      const owns = await this.teacherSubjects.exists({ where: { subjectId: id, teacherId: actor.teacherProfileId ?? '' } });
      if (!owns) {
        throw new ForbiddenException('You are not assigned to this subject.');
      }
    }
    if (actor.role === Role.STUDENT && !subject.isActive) {
      throw new NotFoundException('Subject not found.');
    }

    return (await this.toViews([subject], actor))[0];
  }

  async update(id: string, dto: UpdateSubjectDto, actor: AuthenticatedUser): Promise<SubjectView> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    if (dto.name !== undefined) {
      const name = normalizeFullName(dto.name);
      await this.assertUnique(name, undefined, id);
      subject.name = name;
      subject.nameKey = nameKey(name);
    }
    if (dto.code !== undefined) {
      if (dto.code !== subject.code) await this.assertUnique(undefined, dto.code, id);
      subject.code = dto.code ?? null;
    }
    if (dto.description !== undefined) subject.description = dto.description ?? null;

    const activeChanged = dto.isActive !== undefined && dto.isActive !== subject.isActive;
    if (dto.isActive !== undefined) subject.isActive = dto.isActive;

    await this.subjects.save(subject);

    await this.audit.record({
      actor,
      action: AuditAction.SUBJECT_UPDATED,
      entityType: 'Subject',
      entityId: id,
      summary: activeChanged
        ? `${subject.isActive ? 'Activated' : 'Deactivated'} subject ${subject.name}`
        : `Updated subject ${subject.name}`,
      details: { fields: Object.keys(dto) },
    });

    return this.findOne(id, actor);
  }

  /**
   * Hard delete is only possible for a subject nothing refers to (no teacher assignments, no
   * assignments, no exam marks). Otherwise the foreign keys refuse and the user is told to
   * deactivate the subject, which keeps all history intact.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const subject = await this.subjects.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    const teacherCount = await this.teacherSubjects.count({ where: { subjectId: id } });
    if (teacherCount > 0) {
      throw new ConflictException('Remove the teacher assignments from this subject first, or deactivate the subject instead.');
    }

    await this.subjects.delete({ id });

    await this.audit.record({
      actor,
      action: AuditAction.SUBJECT_DELETED,
      entityType: 'Subject',
      entityId: id,
      summary: `Deleted subject ${subject.name}`,
    });

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------

  private async assertUnique(name: string | undefined, code: string | null | undefined, excludeId?: string): Promise<void> {
    if (name) {
      const qb = this.subjects.createQueryBuilder('subject').where('subject.nameKey = :key', { key: nameKey(name) });
      if (excludeId) qb.andWhere('subject.id <> :excludeId', { excludeId });
      if (await qb.getExists()) {
        throw new ConflictException('A subject with this name already exists.');
      }
    }
    if (code) {
      const qb = this.subjects.createQueryBuilder('subject').where('subject.code = :code', { code });
      if (excludeId) qb.andWhere('subject.id <> :excludeId', { excludeId });
      if (await qb.getExists()) {
        throw new ConflictException('A subject with this code already exists.');
      }
    }
  }

  /** Attaches the assigned teachers to a page of subjects with a single extra query. */
  private async toViews(subjects: Subject[], actor: AuthenticatedUser): Promise<SubjectView[]> {
    if (subjects.length === 0) return [];

    const rows = await this.teacherSubjects.find({
      where: { subjectId: In(subjects.map((subject) => subject.id)) },
      relations: { teacher: { user: true } },
      order: { createdAt: 'ASC' },
    });

    const byTeacherSubject = new Map<string, SubjectTeacherRef[]>();
    for (const row of rows) {
      const teachers = byTeacherSubject.get(row.subjectId) ?? [];
      teachers.push({
        assignmentId: row.id,
        teacherId: row.teacherId,
        teacherName: row.teacher.user.fullName,
        teacherActive: row.teacher.user.status === 'ACTIVE',
      });
      byTeacherSubject.set(row.subjectId, teachers);
    }

    return subjects.map((subject) => {
      let teachers = byTeacherSubject.get(subject.id) ?? [];
      // A teacher sees colleagues' names on a shared subject only as names, never ids of others' accounts.
      if (actor.role === Role.TEACHER) {
        teachers = teachers.filter((ref) => ref.teacherId === actor.teacherProfileId);
      }
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        isActive: subject.isActive,
        teachers,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      };
    });
  }
}
