import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { Mark } from '../marks/marks.entity';
import { SettingsService } from '../settings/settings.service';
import { Subject } from '../subjects/subjects.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { CreateExaminationDto, ExaminationSubjectInputDto } from './dto/create-examination.dto';
import { ExaminationQueryDto } from './dto/examination-query.dto';
import { UpdateExaminationDto } from './dto/update-examination.dto';
import { Examination, ExaminationSubject } from './examinations.entity';
import {
  ExaminationStatus,
  ExaminationSubjectView,
  ExaminationView,
  MarksStatus,
} from './types/examination.types.interface';

const SORTABLE = {
  examDate: 'exam.examDate',
  name: 'exam.name',
  status: 'exam.status',
  type: 'exam.type',
  createdAt: 'exam.createdAt',
};

@Injectable()
export class ExaminationsService {
  constructor(
    @InjectRepository(Examination) private readonly exams: Repository<Examination>,
    @InjectRepository(ExaminationSubject) private readonly examSubjects: Repository<ExaminationSubject>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateExaminationDto, actor: AuthenticatedUser): Promise<ExaminationView> {
    const inputs = this.assertNoDuplicateSubjects(dto.subjects);
    await this.loadUsableSubjects(this.examSubjects.manager, inputs.map((input) => input.subjectId));

    const academicPeriod =
      dto.academicPeriod !== undefined ? dto.academicPeriod : ((await this.settings.find())?.currentPeriod ?? null);

    const id = await this.exams.manager.transaction(async (manager) => {
      const exam = await manager.getRepository(Examination).save(
        manager.getRepository(Examination).create({
          name: normalizeFullName(dto.name),
          type: dto.type,
          examDate: dto.examDate.slice(0, 10),
          academicPeriod,
          instructions: dto.instructions ?? null,
          status: dto.status ?? ExaminationStatus.SCHEDULED,
          createdById: actor.id,
        }),
      );
      const repository = manager.getRepository(ExaminationSubject);
      await repository.save(
        inputs.map((input) =>
          repository.create({ examinationId: exam.id, subjectId: input.subjectId, maxMarks: input.maxMarks }),
        ),
      );
      return exam.id;
    });

    await this.audit.record({
      actor,
      action: AuditAction.EXAMINATION_CREATED,
      entityType: 'Examination',
      entityId: id,
      summary: `Created examination ${normalizeFullName(dto.name)}`,
      details: { subjects: inputs.length, examDate: dto.examDate.slice(0, 10) },
    });

    return this.findOne(id, actor);
  }

  /**
   * Class Master: everything. Teacher: published-to-staff examinations that include one of their
   * subjects (showing only those subjects). Student: every examination that is not a draft.
   */
  async list(query: ExaminationQueryDto, actor: AuthenticatedUser): Promise<Paginated<ExaminationView>> {
    const qb = this.exams.createQueryBuilder('exam');

    if (actor.role !== Role.CLASS_MASTER) {
      qb.andWhere('exam.status <> :draft', { draft: ExaminationStatus.DRAFT });
    }
    if (actor.role === Role.TEACHER) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM examination_subjects es
           INNER JOIN teacher_subjects ts ON ts.subject_id = es.subject_id
           WHERE es.examination_id = exam.id AND ts.teacher_id = :ownTeacherId
         )`,
        { ownTeacherId: actor.teacherProfileId },
      );
    }

    if (query.status) qb.andWhere('exam.status = :status', { status: query.status });
    if (query.type) qb.andWhere('exam.type = :type', { type: query.type });
    if (query.subjectId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM examination_subjects es WHERE es.examination_id = exam.id AND es.subject_id = :subjectId)`,
        { subjectId: query.subjectId },
      );
    }
    if (query.upcoming) qb.andWhere('exam.examDate >= CURRENT_DATE');
    if (query.resultsPublished !== undefined) {
      qb.andWhere(query.resultsPublished ? 'exam.resultsPublishedAt IS NOT NULL' : 'exam.resultsPublishedAt IS NULL');
    }
    if (query.from) qb.andWhere('exam.examDate >= :from', { from: query.from.slice(0, 10) });
    if (query.to) qb.andWhere('exam.examDate <= :to', { to: query.to.slice(0, 10) });
    if (query.search) {
      qb.andWhere(`(exam.name ILIKE :search ESCAPE '\\' OR exam.academicPeriod ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'examDate'), query.sortBy ? query.sortOrder : 'DESC')
      .addOrderBy('exam.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const views = await this.toViews(rows, actor);
    return buildPaginated(views, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<ExaminationView> {
    const exam = await this.exams.findOne({ where: { id } });
    if (!exam || (actor.role !== Role.CLASS_MASTER && exam.status === ExaminationStatus.DRAFT)) {
      throw new NotFoundException('Examination not found.');
    }

    const view = (await this.toViews([exam], actor))[0];
    if (actor.role === Role.TEACHER && view.subjects.length === 0) {
      throw new ForbiddenException('None of your subjects are part of this examination.');
    }
    return view;
  }

  async update(id: string, dto: UpdateExaminationDto, actor: AuthenticatedUser): Promise<ExaminationView> {
    const exam = await this.exams.findOne({ where: { id } });
    if (!exam) {
      throw new NotFoundException('Examination not found.');
    }
    if (dto.subjects && exam.resultsPublishedAt) {
      throw new ConflictException('Results are published. Unpublish them before changing the subjects or maximum marks.');
    }
    const inputs = dto.subjects ? this.assertNoDuplicateSubjects(dto.subjects) : null;

    await this.exams.manager.transaction(async (manager) => {
      if (dto.name !== undefined) exam.name = normalizeFullName(dto.name);
      if (dto.type !== undefined) exam.type = dto.type;
      if (dto.examDate !== undefined) exam.examDate = dto.examDate.slice(0, 10);
      if (dto.academicPeriod !== undefined) exam.academicPeriod = dto.academicPeriod ?? null;
      if (dto.instructions !== undefined) exam.instructions = dto.instructions ?? null;
      if (dto.status !== undefined) exam.status = dto.status;
      await manager.getRepository(Examination).save(exam);

      if (inputs) {
        await this.reconcileSubjects(manager, id, inputs);
      }
    });

    await this.audit.record({
      actor,
      action: AuditAction.EXAMINATION_UPDATED,
      entityType: 'Examination',
      entityId: id,
      summary: `Updated examination ${exam.name}`,
      details: { fields: Object.keys(dto) },
    });

    return this.findOne(id, actor);
  }

  /** Only possible while no marks exist. After that, set the status to CANCELLED instead. */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const exam = await this.exams.findOne({ where: { id } });
    if (!exam) {
      throw new NotFoundException('Examination not found.');
    }

    const markCount = await this.marks
      .createQueryBuilder('mark')
      .innerJoin('mark.examinationSubject', 'es')
      .where('es.examinationId = :id', { id })
      .getCount();
    if (markCount > 0 || exam.resultsPublishedAt) {
      throw new ConflictException('Marks have been entered for this examination, so it cannot be deleted. Set its status to Cancelled instead.');
    }

    await this.exams.delete({ id });

    await this.audit.record({
      actor,
      action: AuditAction.EXAMINATION_DELETED,
      entityType: 'Examination',
      entityId: id,
      summary: `Deleted examination ${exam.name}`,
    });

    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------

  private assertNoDuplicateSubjects(subjects: ExaminationSubjectInputDto[]): ExaminationSubjectInputDto[] {
    const seen = new Set<string>();
    for (const subject of subjects) {
      if (seen.has(subject.subjectId)) {
        throw new BadRequestException('A subject can only be added once to an examination.');
      }
      seen.add(subject.subjectId);
    }
    return subjects;
  }

  /** Loads the subjects and makes sure every id exists and is still active. */
  private async loadUsableSubjects(manager: EntityManager, ids: string[]): Promise<Subject[]> {
    const found = await manager.getRepository(Subject).find({ where: { id: In(ids) } });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException('One or more selected subjects do not exist.');
    }
    const inactive = found.find((subject) => !subject.isActive);
    if (inactive) {
      throw new BadRequestException(`The subject ${inactive.name} is inactive. Activate it before adding it to an examination.`);
    }
    return found;
  }

  /** Makes the examination's subject list match `inputs` without ever discarding entered marks. */
  private async reconcileSubjects(manager: EntityManager, examinationId: string, inputs: ExaminationSubjectInputDto[]): Promise<void> {
    const repository = manager.getRepository(ExaminationSubject);
    const existing = await repository.find({ where: { examinationId }, relations: { subject: true } });
    const existingBySubject = new Map(existing.map((row) => [row.subjectId, row]));
    const wanted = new Set(inputs.map((input) => input.subjectId));

    for (const row of existing) {
      if (wanted.has(row.subjectId)) continue;
      const markCount = await manager.getRepository(Mark).count({ where: { examinationSubjectId: row.id } });
      if (row.marksStatus !== MarksStatus.PENDING || markCount > 0) {
        throw new ConflictException(`${row.subject.name} already has marks, so it cannot be removed from this examination.`);
      }
      await repository.delete({ id: row.id });
    }

    const newIds: string[] = [];
    for (const input of inputs) {
      const current = existingBySubject.get(input.subjectId);
      if (!current) {
        newIds.push(input.subjectId);
        continue;
      }
      if (current.maxMarks === input.maxMarks) continue;

      if (current.marksStatus === MarksStatus.SUBMITTED || current.marksStatus === MarksStatus.APPROVED) {
        throw new ConflictException(`Marks for ${current.subject.name} are already ${current.marksStatus.toLowerCase()}. Reject them before changing the maximum marks.`);
      }
      const highest = await manager
        .getRepository(Mark)
        .createQueryBuilder('mark')
        .select('MAX(mark.score)', 'max')
        .where('mark.examinationSubjectId = :id', { id: current.id })
        .getRawOne<{ max: string | null }>();
      if (highest?.max !== null && highest?.max !== undefined && parseFloat(highest.max) > input.maxMarks) {
        throw new ConflictException(`A student in ${current.subject.name} already has ${highest.max} marks, which is above ${input.maxMarks}.`);
      }
      await repository.update({ id: current.id }, { maxMarks: input.maxMarks });
    }

    if (newIds.length > 0) {
      await this.loadUsableSubjects(manager, newIds);
      await repository.save(
        newIds.map((subjectId) =>
          repository.create({
            examinationId,
            subjectId,
            maxMarks: inputs.find((input) => input.subjectId === subjectId)!.maxMarks,
          }),
        ),
      );
    }
  }

  private async ownSubjectIds(actor: AuthenticatedUser): Promise<Set<string>> {
    if (actor.role !== Role.TEACHER || !actor.teacherProfileId) return new Set();
    const rows = await this.teacherSubjects.find({ where: { teacherId: actor.teacherProfileId }, select: { subjectId: true } });
    return new Set(rows.map((row) => row.subjectId));
  }

  /** One extra query loads the subjects of a whole page of examinations. */
  private async toViews(exams: Examination[], actor: AuthenticatedUser): Promise<ExaminationView[]> {
    if (exams.length === 0) return [];

    const rows = await this.examSubjects.find({
      where: { examinationId: In(exams.map((exam) => exam.id)) },
      relations: { subject: true },
    });
    const own = await this.ownSubjectIds(actor);
    const showWorkflow = actor.role !== Role.STUDENT;

    const byExam = new Map<string, ExaminationSubjectView[]>();
    for (const row of rows) {
      if (actor.role === Role.TEACHER && !own.has(row.subjectId)) continue;

      const subjectView: ExaminationSubjectView = {
        id: row.id,
        subjectId: row.subjectId,
        subjectName: row.subject.name,
        subjectCode: row.subject.code,
        maxMarks: row.maxMarks,
      };
      if (showWorkflow) {
        subjectView.marksStatus = row.marksStatus;
        subjectView.reviewFeedback = row.reviewFeedback;
        subjectView.submittedAt = row.submittedAt;
        subjectView.reviewedAt = row.reviewedAt;
      }
      const list = byExam.get(row.examinationId) ?? [];
      list.push(subjectView);
      byExam.set(row.examinationId, list);
    }

    return exams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      type: exam.type,
      examDate: exam.examDate,
      academicPeriod: exam.academicPeriod,
      instructions: exam.instructions,
      status: exam.status,
      resultsPublished: exam.resultsPublishedAt !== null,
      resultsPublishedAt: exam.resultsPublishedAt,
      subjects: (byExam.get(exam.id) ?? []).sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    }));
  }
}
