import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { FilesService } from '../files/files.service';
import { FileCategory, FileOwnerType } from '../files/types/file.types.interface';
import { SettingsService } from '../settings/settings.service';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { Assignment, AssignmentAttachment } from './assignments.entity';
import { AssignmentQueryDto, AssignmentTimeFilter } from './dto/assignment-query.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentAvailabilityDto } from './dto/update-assignment-availability.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import {
  AssignmentAttachmentView,
  AssignmentState,
  AssignmentView,
  MAX_ASSIGNMENT_ATTACHMENTS,
  MySubmissionSummary,
} from './types/assignment.types.interface';

const SORTABLE = {
  dueAt: 'a.dueAt',
  title: 'a.title',
  createdAt: 'a.createdAt',
  subjectName: 'subject.name',
  maxMarks: 'a.maxMarks',
};

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(AssignmentAttachment) private readonly attachments: Repository<AssignmentAttachment>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateAssignmentDto, actor: AuthenticatedUser): Promise<AssignmentView> {
    const dueAt = new Date(dto.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      throw new BadRequestException('The deadline must be in the future.');
    }

    const subject = await this.subjects.findOne({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }
    if (!subject.isActive) {
      throw new BadRequestException('This subject is inactive.');
    }
    await this.assertTeachesSubject(actor, subject.id);

    const fileIds = [...new Set(dto.attachmentFileIds ?? [])];

    const id = await this.assignments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Assignment);
      const assignment = await repository.save(
        repository.create({
          subjectId: subject.id,
          teacherId: actor.teacherProfileId!,
          title: dto.title,
          description: dto.description ?? null,
          dueAt,
          maxMarks: dto.maxMarks,
          isAvailable: dto.isAvailable ?? true,
          allowLateSubmissions: dto.allowLateSubmissions ?? false,
        }),
      );
      await this.addAttachments(manager, assignment.id, fileIds, actor);
      return assignment.id;
    });

    await this.audit.record({
      actor,
      action: AuditAction.ASSIGNMENT_CREATED,
      entityType: 'Assignment',
      entityId: id,
      summary: `Created assignment "${dto.title}" for ${subject.name}`,
      details: { dueAt: dueAt.toISOString(), maxMarks: dto.maxMarks, attachments: fileIds.length },
    });

    return this.findOne(id, actor);
  }

  /**
   * Class Master: all assignments. Teacher: assignments of their subjects.
   * Student: available assignments of active subjects, with their own submission status.
   */
  async list(query: AssignmentQueryDto, actor: AuthenticatedUser): Promise<Paginated<AssignmentView>> {
    // withDeleted() must come before the joins (see StudentsService.baseQuery): assignments written
    // by a teacher who was later removed must stay visible.
    const qb = this.assignments
      .createQueryBuilder('a')
      .withDeleted()
      .innerJoinAndSelect('a.subject', 'subject')
      .innerJoinAndSelect('a.teacher', 'teacher')
      .innerJoinAndSelect('teacher.user', 'teacherUser');

    if (actor.role === Role.TEACHER) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = a.subject_id AND ts.teacher_id = :ownTeacherId)`,
        { ownTeacherId: actor.teacherProfileId },
      );
    } else if (actor.role === Role.STUDENT) {
      qb.andWhere('a.isAvailable = true').andWhere('subject.isActive = true');
      if (query.notSubmitted) {
        qb.andWhere(`NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = :ownStudentId)`, {
          ownStudentId: actor.studentProfileId,
        });
      }
    }

    if (actor.role !== Role.STUDENT) {
      if (query.isAvailable !== undefined) qb.andWhere('a.isAvailable = :isAvailable', { isAvailable: query.isAvailable });
      if (query.pendingGrading) {
        qb.andWhere(`EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.score IS NULL)`);
      }
    }
    if (actor.role === Role.CLASS_MASTER && query.teacherId) {
      qb.andWhere('a.teacherId = :teacherId', { teacherId: query.teacherId });
    }
    if (query.subjectId) qb.andWhere('a.subjectId = :subjectId', { subjectId: query.subjectId });
    if (query.time === AssignmentTimeFilter.OPEN) qb.andWhere('a.dueAt > now()');
    if (query.time === AssignmentTimeFilter.CLOSED) qb.andWhere('a.dueAt <= now()');
    if (query.dueFrom) qb.andWhere('a.dueAt >= :dueFrom', { dueFrom: new Date(query.dueFrom) });
    if (query.dueTo) qb.andWhere('a.dueAt <= :dueTo', { dueTo: new Date(query.dueTo) });
    if (query.search) {
      qb.andWhere(`(a.title ILIKE :search ESCAPE '\\' OR subject.name ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'dueAt'), query.sortOrder)
      .addOrderBy('a.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const views = await this.toViews(rows, actor);
    return buildPaginated(views, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<AssignmentView> {
    const assignment = await this.loadVisible(id, actor);
    return (await this.toViews([assignment], actor))[0];
  }

  async update(id: string, dto: UpdateAssignmentDto, actor: AuthenticatedUser): Promise<AssignmentView> {
    const assignment = await this.loadOwned(id, actor);

    if (dto.maxMarks !== undefined && dto.maxMarks < assignment.maxMarks) {
      const highest = await this.submissions
        .createQueryBuilder('s')
        .select('MAX(s.score)', 'max')
        .where('s.assignmentId = :id', { id })
        .getRawOne<{ max: string | null }>();
      if (highest?.max && parseFloat(highest.max) > dto.maxMarks) {
        throw new ConflictException(`A student already has ${highest.max} marks, which is above ${dto.maxMarks}.`);
      }
    }

    const toRemove = [...new Set(dto.removeAttachmentFileIds ?? [])];
    const toAdd = [...new Set(dto.addAttachmentFileIds ?? [])];
    let discardAfter: string[] = [];

    await this.assignments.manager.transaction(async (manager) => {
      if (dto.title !== undefined) assignment.title = dto.title;
      if (dto.description !== undefined) assignment.description = dto.description ?? null;
      if (dto.dueAt !== undefined) assignment.dueAt = new Date(dto.dueAt);
      if (dto.maxMarks !== undefined) assignment.maxMarks = dto.maxMarks;
      if (dto.isAvailable !== undefined) assignment.isAvailable = dto.isAvailable;
      if (dto.allowLateSubmissions !== undefined) assignment.allowLateSubmissions = dto.allowLateSubmissions;
      await manager.getRepository(Assignment).save(assignment);

      const current = await manager.getRepository(AssignmentAttachment).find({ where: { assignmentId: id } });
      const removable = current.filter((attachment) => toRemove.includes(attachment.fileId));
      if (toRemove.length !== removable.length) {
        throw new BadRequestException('One of the files to remove is not attached to this assignment.');
      }
      if (current.length - removable.length + toAdd.length > MAX_ASSIGNMENT_ATTACHMENTS) {
        throw new BadRequestException(`An assignment can have at most ${MAX_ASSIGNMENT_ATTACHMENTS} attachments.`);
      }
      if (removable.length > 0) {
        await manager.getRepository(AssignmentAttachment).delete({ id: In(removable.map((attachment) => attachment.id)) });
        discardAfter = removable.map((attachment) => attachment.fileId);
      }
      await this.addAttachments(manager, id, toAdd, actor);
    });

    for (const fileId of discardAfter) {
      await this.files.discard(fileId);
    }

    await this.audit.record({
      actor,
      action: AuditAction.ASSIGNMENT_UPDATED,
      entityType: 'Assignment',
      entityId: id,
      summary: `Updated assignment "${assignment.title}"`,
      details: { fields: Object.keys(dto) },
    });

    return this.findOne(id, actor);
  }

  /** Shows or hides an assignment for students. */
  async setAvailability(id: string, dto: UpdateAssignmentAvailabilityDto, actor: AuthenticatedUser): Promise<AssignmentView> {
    const assignment = actor.role === Role.TEACHER ? await this.loadOwned(id, actor) : await this.loadVisible(id, actor);

    if (assignment.isAvailable !== dto.isAvailable) {
      await this.assignments.update({ id }, { isAvailable: dto.isAvailable });
      await this.audit.record({
        actor,
        action: AuditAction.ASSIGNMENT_AVAILABILITY_CHANGED,
        entityType: 'Assignment',
        entityId: id,
        summary: `${dto.isAvailable ? 'Made available' : 'Hid'} assignment "${assignment.title}"`,
      });
    }
    return this.findOne(id, actor);
  }

  /** Teacher only, and only while nobody has submitted. After that, hide the assignment instead. */
  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const assignment = await this.loadOwned(id, actor);

    const submissionCount = await this.submissions.count({ where: { assignmentId: id } });
    if (submissionCount > 0) {
      throw new ConflictException('Students have already submitted work, so this assignment cannot be deleted. Hide it instead.');
    }

    const attached = await this.attachments.find({ where: { assignmentId: id } });
    await this.assignments.delete({ id });
    for (const attachment of attached) {
      await this.files.discard(attachment.fileId);
    }

    await this.audit.record({
      actor,
      action: AuditAction.ASSIGNMENT_DELETED,
      entityType: 'Assignment',
      entityId: id,
      summary: `Deleted assignment "${assignment.title}"`,
    });
    return { deleted: true };
  }

  /** Authorized download of an attachment: visible assignments only for students. */
  async downloadAttachment(assignmentId: string, fileId: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    await this.loadVisible(assignmentId, actor);
    const attachment = await this.attachments.findOne({ where: { assignmentId, fileId } });
    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }
    return this.files.stream(await this.files.getRecord(fileId));
  }

  // ---------------------------------------------------------------------------------------------

  private async assertTeachesSubject(actor: AuthenticatedUser, subjectId: string): Promise<void> {
    const teaches = await this.teacherSubjects.exists({ where: { teacherId: actor.teacherProfileId ?? '', subjectId } });
    if (!teaches) {
      throw new ForbiddenException('You are not assigned to this subject.');
    }
  }

  /** An assignment the caller is allowed to read (students: only available ones of active subjects). */
  private async loadVisible(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    const assignment = await this.assignments
      .createQueryBuilder('a')
      .withDeleted()
      .innerJoinAndSelect('a.subject', 'subject')
      .innerJoinAndSelect('a.teacher', 'teacher')
      .innerJoinAndSelect('teacher.user', 'teacherUser')
      .where('a.id = :id', { id })
      .getOne();
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    if (actor.role === Role.STUDENT && (!assignment.isAvailable || !assignment.subject.isActive)) {
      throw new NotFoundException('Assignment not found.');
    }
    if (actor.role === Role.TEACHER) {
      await this.assertTeachesSubject(actor, assignment.subjectId);
    }
    return assignment;
  }

  /** An assignment the teacher wrote themselves and still teaches the subject of. */
  private async loadOwned(id: string, actor: AuthenticatedUser): Promise<Assignment> {
    const assignment = await this.loadVisible(id, actor);
    if (actor.role !== Role.TEACHER || assignment.teacherId !== actor.teacherProfileId) {
      throw new ForbiddenException('You can only change your own assignments.');
    }
    return assignment;
  }

  /** Validates uploads (type, uploader, not yet used) and links them to the assignment. */
  private async addAttachments(manager: EntityManager, assignmentId: string, fileIds: string[], actor: AuthenticatedUser): Promise<void> {
    for (const fileId of fileIds) {
      await this.files.assertLinkableUpload(fileId, actor, FileCategory.ASSIGNMENT_ATTACHMENT, manager);
      await manager.getRepository(AssignmentAttachment).save(manager.getRepository(AssignmentAttachment).create({ assignmentId, fileId }));
      await this.files.attach(fileId, FileOwnerType.ASSIGNMENT, assignmentId, manager);
    }
  }

  private stateOf(assignment: Assignment, now: number): AssignmentState {
    if (assignment.dueAt.getTime() > now) return 'OPEN';
    return assignment.allowLateSubmissions ? 'OVERDUE' : 'CLOSED';
  }

  /** One extra query each for attachments, counts and the student's own submissions. */
  private async toViews(rows: Assignment[], actor: AuthenticatedUser): Promise<AssignmentView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const now = Date.now();
    const submissionsEnabled = await this.settings.areSubmissionsEnabled();

    const attachmentRows = await this.attachments.find({ where: { assignmentId: In(ids) }, relations: { file: true }, order: { createdAt: 'ASC' } });
    const attachmentsByAssignment = new Map<string, AssignmentAttachmentView[]>();
    for (const row of attachmentRows) {
      const list = attachmentsByAssignment.get(row.assignmentId) ?? [];
      list.push({ fileId: row.fileId, name: row.file.originalName, mimeType: row.file.mimeType, sizeBytes: row.file.sizeBytes });
      attachmentsByAssignment.set(row.assignmentId, list);
    }

    const counts = new Map<string, { submitted: number; graded: number }>();
    const mine = new Map<string, MySubmissionSummary>();

    if (actor.role === Role.STUDENT) {
      const own = await this.submissions.find({ where: { assignmentId: In(ids), studentId: actor.studentProfileId ?? '' } });
      for (const submission of own) {
        // The score and feedback stay hidden until the teacher releases them.
        const released = submission.isReleased && submission.score !== null;
        mine.set(submission.assignmentId, {
          id: submission.id,
          status: released ? 'GRADED' : 'SUBMITTED',
          submittedAt: submission.submittedAt,
          isLate: submission.isLate,
          score: released ? submission.score : null,
          feedback: released ? submission.feedback : null,
        });
      }
    } else {
      const grouped = await this.submissions
        .createQueryBuilder('s')
        .select('s.assignmentId', 'id')
        .addSelect('COUNT(*)', 'submitted')
        .addSelect('COUNT(s.score)', 'graded')
        .where('s.assignmentId IN (:...ids)', { ids })
        .groupBy('s.assignmentId')
        .getRawMany<{ id: string; submitted: string; graded: string }>();
      for (const row of grouped) {
        counts.set(row.id, { submitted: parseInt(row.submitted, 10), graded: parseInt(row.graded, 10) });
      }
    }

    return rows.map((row) => {
      const state = this.stateOf(row, now);
      const view: AssignmentView = {
        id: row.id,
        title: row.title,
        description: row.description,
        subjectId: row.subjectId,
        subjectName: row.subject.name,
        teacherId: row.teacherId,
        teacherName: row.teacher.user.fullName,
        dueAt: row.dueAt,
        maxMarks: row.maxMarks,
        isAvailable: row.isAvailable,
        allowLateSubmissions: row.allowLateSubmissions,
        state,
        acceptsSubmissions: row.isAvailable && row.subject.isActive && submissionsEnabled && state !== 'CLOSED',
        attachments: attachmentsByAssignment.get(row.id) ?? [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      if (actor.role === Role.STUDENT) {
        view.mySubmission = mine.get(row.id) ?? null;
      } else {
        view.submissionsCount = counts.get(row.id)?.submitted ?? 0;
        view.gradedCount = counts.get(row.id)?.graded ?? 0;
      }
      return view;
    });
  }
}
