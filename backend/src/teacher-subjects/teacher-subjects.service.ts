import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { Subject } from '../subjects/subjects.entity';
import { Teacher } from '../teachers/teachers.entity';
import { AssignTeacherSubjectDto } from './dto/assign-teacher-subject.dto';
import { TeacherSubjectQueryDto } from './dto/teacher-subject-query.dto';
import { UpdateTeacherSubjectDto } from './dto/update-teacher-subject.dto';
import { TeacherSubject } from './teacher-subjects.entity';
import { TeacherSubjectView } from './types/teacher-subject.types.interface';

const SORTABLE = {
  assignedAt: 'ts.createdAt',
  teacherName: 'user.fullName',
  subjectName: 'subject.name',
};

@Injectable()
export class TeacherSubjectsService {
  constructor(
    @InjectRepository(TeacherSubject) private readonly assignments: Repository<TeacherSubject>,
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    private readonly audit: AuditLogsService,
  ) {}

  async assign(dto: AssignTeacherSubjectDto, actor: AuthenticatedUser): Promise<TeacherSubjectView> {
    const [teacher, subject] = await this.loadParties(dto.teacherId, dto.subjectId);
    await this.assertNotAssigned(dto.teacherId, dto.subjectId);

    const saved = await this.assignments.save(
      this.assignments.create({ teacherId: teacher.id, subjectId: subject.id, assignedById: actor.id }),
    );

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_SUBJECT_ASSIGNED,
      entityType: 'TeacherSubject',
      entityId: saved.id,
      summary: `Assigned ${teacher.user.fullName} to ${subject.name}`,
      details: { teacherId: teacher.id, subjectId: subject.id },
    });

    return this.findOne(saved.id);
  }

  async list(query: TeacherSubjectQueryDto): Promise<Paginated<TeacherSubjectView>> {
    const qb = this.baseQuery();

    if (query.teacherId) qb.andWhere('ts.teacherId = :teacherId', { teacherId: query.teacherId });
    if (query.subjectId) qb.andWhere('ts.subjectId = :subjectId', { subjectId: query.subjectId });
    if (query.search) {
      qb.andWhere(`(user.fullName ILIKE :search ESCAPE '\\' OR subject.name ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'subjectName'), query.sortBy ? query.sortOrder : 'ASC')
      .addOrderBy('ts.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row)), total, query.page, query.limit);
  }

  async findOne(id: string): Promise<TeacherSubjectView> {
    const row = await this.baseQuery().andWhere('ts.id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException('Assignment not found.');
    }
    return this.toView(row);
  }

  /** Moves an assignment to a different teacher and/or subject. */
  async update(id: string, dto: UpdateTeacherSubjectDto, actor: AuthenticatedUser): Promise<TeacherSubjectView> {
    const current = await this.assignments.findOne({ where: { id } });
    if (!current) {
      throw new NotFoundException('Assignment not found.');
    }
    if (!dto.teacherId && !dto.subjectId) {
      throw new BadRequestException('Provide a teacherId or a subjectId to change.');
    }

    const teacherId = dto.teacherId ?? current.teacherId;
    const subjectId = dto.subjectId ?? current.subjectId;
    const [teacher, subject] = await this.loadParties(teacherId, subjectId);
    if (teacherId !== current.teacherId || subjectId !== current.subjectId) {
      await this.assertNotAssigned(teacherId, subjectId, id);
    }

    await this.assignments.update({ id }, { teacherId: teacher.id, subjectId: subject.id, assignedById: actor.id });

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_SUBJECT_ASSIGNED,
      entityType: 'TeacherSubject',
      entityId: id,
      summary: `Reassigned ${subject.name} to ${teacher.user.fullName}`,
      details: { from: { teacherId: current.teacherId, subjectId: current.subjectId }, to: { teacherId, subjectId } },
    });

    return this.findOne(id);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const row = await this.baseQuery().andWhere('ts.id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException('Assignment not found.');
    }

    await this.assignments.delete({ id });

    await this.audit.record({
      actor,
      action: AuditAction.TEACHER_SUBJECT_REMOVED,
      entityType: 'TeacherSubject',
      entityId: id,
      summary: `Removed ${row.teacher.user.fullName} from ${row.subject.name}`,
      details: { teacherId: row.teacherId, subjectId: row.subjectId },
    });

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------

  private baseQuery() {
    return this.assignments
      .createQueryBuilder('ts')
      .innerJoinAndSelect('ts.teacher', 'teacher')
      .innerJoinAndSelect('teacher.user', 'user')
      .innerJoinAndSelect('ts.subject', 'subject');
  }

  private async loadParties(teacherId: string, subjectId: string): Promise<[Teacher, Subject]> {
    const teacher = await this.teachers.findOne({ where: { id: teacherId }, relations: { user: true } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found.');
    }
    if (teacher.user.status === AccountStatus.DEACTIVATED) {
      throw new BadRequestException('This teacher account is deactivated.');
    }

    const subject = await this.subjects.findOne({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }
    if (!subject.isActive) {
      throw new BadRequestException('This subject is inactive. Activate it before assigning a teacher.');
    }
    return [teacher, subject];
  }

  private async assertNotAssigned(teacherId: string, subjectId: string, excludeId?: string): Promise<void> {
    const qb = this.assignments
      .createQueryBuilder('ts')
      .where('ts.teacherId = :teacherId AND ts.subjectId = :subjectId', { teacherId, subjectId });
    if (excludeId) qb.andWhere('ts.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException('This teacher is already assigned to that subject.');
    }
  }

  private toView(row: TeacherSubject): TeacherSubjectView {
    return {
      id: row.id,
      teacherId: row.teacherId,
      teacherName: row.teacher.user.fullName,
      teacherActive: row.teacher.user.status === AccountStatus.ACTIVE,
      subjectId: row.subjectId,
      subjectName: row.subject.name,
      subjectCode: row.subject.code,
      subjectActive: row.subject.isActive,
      assignedAt: row.createdAt,
    };
  }
}
