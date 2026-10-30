import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Assignment } from '../assignments/assignments.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { resolveSort } from '../common/utils/sort.util';
import { FilesService } from '../files/files.service';
import { FileCategory, FileOwnerType } from '../files/types/file.types.interface';
import { SettingsService } from '../settings/settings.service';
import { Student } from '../students/students.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionQueryDto, SubmissionStatusFilter } from './dto/submission-query.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { Submission } from './submissions.entity';
import { AssignmentOverview, AssignmentOverviewRow, SubmissionView } from './types/submission.types.interface';

const SORTABLE = {
  submittedAt: 's.submittedAt',
  studentName: 'user.fullName',
  score: 's.score',
  assignmentTitle: 'a.title',
};

const cents = (value: number): number => Math.round(value * 100);

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Student: submitting work

  async create(dto: CreateSubmissionDto, actor: AuthenticatedUser): Promise<SubmissionView> {
    const studentId = this.requireStudent(actor);
    await this.assertSubmissionsEnabled();

    if (!dto.textAnswer && !dto.fileId) {
      throw new BadRequestException('Write an answer or attach a file before submitting.');
    }

    const assignment = await this.loadOpenAssignment(dto.assignmentId);
    if (await this.submissions.exists({ where: { assignmentId: assignment.id, studentId } })) {
      throw new ConflictException('You have already submitted this assignment. Edit your submission instead.');
    }

    const now = new Date();
    const id = await this.submissions.manager.transaction(async (manager) => {
      if (dto.fileId) {
        await this.files.assertLinkableUpload(dto.fileId, actor, FileCategory.SUBMISSION, manager);
      }
      const repository = manager.getRepository(Submission);
      const submission = await repository.save(
        repository.create({
          assignmentId: assignment.id,
          studentId,
          textAnswer: dto.textAnswer ?? null,
          fileId: dto.fileId ?? null,
          submittedAt: now,
          isLate: now.getTime() > assignment.dueAt.getTime(),
        }),
      );
      if (dto.fileId) {
        await this.files.attach(dto.fileId, FileOwnerType.SUBMISSION, submission.id, manager);
      }
      return submission.id;
    });

    await this.audit.record({
      actor,
      action: AuditAction.SUBMISSION_CREATED,
      entityType: 'Submission',
      entityId: id,
      summary: `Submitted "${assignment.title}"`,
      details: { late: now.getTime() > assignment.dueAt.getTime(), hasFile: !!dto.fileId },
    });

    return this.findOne(id, actor);
  }

  /** Students may change their work until the teacher grades it, while the assignment still accepts work. */
  async update(id: string, dto: UpdateSubmissionDto, actor: AuthenticatedUser): Promise<SubmissionView> {
    const studentId = this.requireStudent(actor);
    await this.assertSubmissionsEnabled();

    const submission = await this.submissions.findOne({ where: { id } });
    if (!submission || submission.studentId !== studentId) {
      throw new NotFoundException('Submission not found.');
    }
    if (submission.score !== null) {
      throw new ConflictException('This submission has been graded and can no longer be changed.');
    }
    const assignment = await this.loadOpenAssignment(submission.assignmentId);

    const textAnswer = dto.textAnswer !== undefined ? dto.textAnswer : submission.textAnswer;
    const fileId = dto.fileId !== undefined ? dto.fileId : submission.fileId;
    if (!textAnswer && !fileId) {
      throw new BadRequestException('A submission needs an answer or a file. Delete nothing, or replace it instead.');
    }

    const replacedFileId = submission.fileId && submission.fileId !== fileId ? submission.fileId : null;
    const now = new Date();

    await this.submissions.manager.transaction(async (manager) => {
      if (fileId && fileId !== submission.fileId) {
        await this.files.assertLinkableUpload(fileId, actor, FileCategory.SUBMISSION, manager);
        await this.files.attach(fileId, FileOwnerType.SUBMISSION, submission.id, manager);
      }
      await manager.getRepository(Submission).update(
        { id },
        { textAnswer: textAnswer ?? null, fileId: fileId ?? null, submittedAt: now, isLate: now.getTime() > assignment.dueAt.getTime() },
      );
    });

    if (replacedFileId) {
      await this.files.discard(replacedFileId);
    }

    await this.audit.record({
      actor,
      action: AuditAction.SUBMISSION_UPDATED,
      entityType: 'Submission',
      entityId: id,
      summary: `Updated submission for "${assignment.title}"`,
    });

    return this.findOne(id, actor);
  }

  /** The signed-in student's own submissions. */
  async mine(query: SubmissionQueryDto, actor: AuthenticatedUser): Promise<Paginated<SubmissionView>> {
    const studentId = this.requireStudent(actor);
    const qb = this.baseQuery().where('s.studentId = :studentId', { studentId });
    if (query.assignmentId) qb.andWhere('s.assignmentId = :assignmentId', { assignmentId: query.assignmentId });
    return this.page(qb, query, actor);
  }

  // ---------------------------------------------------------------------------------------------
  // Staff: monitoring and grading

  /** Class Master: every submission (monitoring). Teacher: submissions to assignments of their subjects. */
  async list(query: SubmissionQueryDto, actor: AuthenticatedUser): Promise<Paginated<SubmissionView>> {
    const qb = this.baseQuery();

    if (actor.role === Role.TEACHER) {
      qb.where(
        `EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = a.subject_id AND ts.teacher_id = :ownTeacherId)`,
        { ownTeacherId: actor.teacherProfileId },
      );
    } else {
      qb.where('1 = 1');
    }

    if (query.assignmentId) qb.andWhere('s.assignmentId = :assignmentId', { assignmentId: query.assignmentId });
    if (query.subjectId) qb.andWhere('a.subjectId = :subjectId', { subjectId: query.subjectId });
    if (query.studentId) qb.andWhere('s.studentId = :studentId', { studentId: query.studentId });
    if (query.status === SubmissionStatusFilter.GRADED) qb.andWhere('s.score IS NOT NULL');
    if (query.status === SubmissionStatusFilter.SUBMITTED) qb.andWhere('s.score IS NULL');
    if (query.isLate !== undefined) qb.andWhere('s.isLate = :isLate', { isLate: query.isLate });
    return this.page(qb, query, actor);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<SubmissionView> {
    const row = await this.loadReadable(id, actor);
    return this.toView(row, actor);
  }

  /** Who has submitted, who is late and who is still missing, for one assignment. */
  async overview(assignmentId: string, actor: AuthenticatedUser): Promise<AssignmentOverview> {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId }, relations: { subject: true } });
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (actor.role === Role.TEACHER) {
      await this.assertTeachesSubject(actor, assignment.subjectId);
    }

    const roster = await this.students
      .createQueryBuilder('student')
      .innerJoinAndSelect('student.user', 'user')
      .orderBy('user.fullName', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .getMany();
    const submitted = await this.submissions.find({ where: { assignmentId } });
    const byStudent = new Map(submitted.map((submission) => [submission.studentId, submission]));

    const rows: AssignmentOverviewRow[] = roster.map((student) => {
      const submission = byStudent.get(student.id);
      return {
        studentId: student.id,
        studentName: student.user.fullName,
        studentCode: student.studentId,
        submissionId: submission?.id ?? null,
        status: !submission ? 'NOT_SUBMITTED' : submission.score !== null ? 'GRADED' : 'SUBMITTED',
        submittedAt: submission?.submittedAt ?? null,
        isLate: submission?.isLate ?? false,
        score: submission?.score ?? null,
        isReleased: submission?.isReleased ?? false,
      };
    });

    return {
      assignmentId: assignment.id,
      title: assignment.title,
      subjectName: assignment.subject.name,
      maxMarks: assignment.maxMarks,
      dueAt: assignment.dueAt,
      counts: {
        students: rows.length,
        submitted: rows.filter((row) => row.status !== 'NOT_SUBMITTED').length,
        graded: rows.filter((row) => row.status === 'GRADED').length,
        late: rows.filter((row) => row.isLate).length,
        missing: rows.filter((row) => row.status === 'NOT_SUBMITTED').length,
      },
      rows,
    };
  }

  /** Grades (or re-grades) a submission. Only a teacher of the assignment's subject may do this. */
  async grade(id: string, dto: GradeSubmissionDto, actor: AuthenticatedUser): Promise<SubmissionView> {
    const row = await this.loadReadable(id, actor);
    const maxMarks = row.assignment.maxMarks;

    if (cents(dto.score) > cents(maxMarks)) {
      throw new BadRequestException(`The score cannot be above the maximum of ${maxMarks}.`);
    }

    const release = dto.release ?? true;
    await this.submissions.update(
      { id },
      { score: dto.score, feedback: dto.feedback ?? null, gradedAt: new Date(), gradedById: actor.id, isReleased: release },
    );

    await this.audit.record({
      actor,
      action: AuditAction.SUBMISSION_GRADED,
      entityType: 'Submission',
      entityId: id,
      summary: `Graded ${row.student.user.fullName} on "${row.assignment.title}": ${dto.score}/${maxMarks}`,
      details: { previousScore: row.score, score: dto.score, released: release },
    });

    return this.findOne(id, actor);
  }

  /** The student's uploaded file. Class Master, the subject's teachers and the owner only. */
  async downloadFile(id: string, actor: AuthenticatedUser): Promise<StreamableFile> {
    const row = await this.loadReadable(id, actor);
    if (!row.fileId) {
      throw new NotFoundException('This submission has no file.');
    }
    return this.files.stream(await this.files.getRecord(row.fileId));
  }

  // ---------------------------------------------------------------------------------------------

  private requireStudent(actor: AuthenticatedUser): string {
    if (!actor.studentProfileId) {
      throw new ForbiddenException('Only students can submit work.');
    }
    return actor.studentProfileId;
  }

  private async assertSubmissionsEnabled(): Promise<void> {
    if (!(await this.settings.areSubmissionsEnabled())) {
      throw new ForbiddenException('Assignment submissions are switched off right now.');
    }
  }

  private async assertTeachesSubject(actor: AuthenticatedUser, subjectId: string): Promise<void> {
    const teaches = await this.teacherSubjects.exists({ where: { teacherId: actor.teacherProfileId ?? '', subjectId } });
    if (!teaches) {
      throw new ForbiddenException('You are not assigned to this subject.');
    }
  }

  /** An assignment that students can currently hand work in for. */
  private async loadOpenAssignment(id: string): Promise<Assignment> {
    const assignment = await this.assignments.findOne({ where: { id }, relations: { subject: true } });
    if (!assignment || !assignment.isAvailable || !assignment.subject.isActive) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.dueAt.getTime() <= Date.now() && !assignment.allowLateSubmissions) {
      throw new ConflictException('The deadline has passed and this assignment does not accept late work.');
    }
    return assignment;
  }

  private baseQuery(): SelectQueryBuilder<Submission> {
    return this.submissions
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.assignment', 'a')
      .innerJoinAndSelect('a.subject', 'subject')
      .innerJoinAndSelect('s.student', 'student')
      .innerJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('s.file', 'file');
  }

  private async page(qb: SelectQueryBuilder<Submission>, query: SubmissionQueryDto, actor: AuthenticatedUser): Promise<Paginated<SubmissionView>> {
    if (query.search) {
      qb.andWhere(`(user.fullName ILIKE :search ESCAPE '\\' OR a.title ILIKE :search ESCAPE '\\' OR student.studentId ILIKE :search ESCAPE '\\')`, {
        search: `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
      });
    }
    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'submittedAt'), query.sortOrder)
      .addOrderBy('s.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row, actor)), total, query.page, query.limit);
  }

  /** A submission the caller may read: their own (student), their subject's (teacher) or any (Class Master). */
  private async loadReadable(id: string, actor: AuthenticatedUser): Promise<Submission> {
    const row = await this.baseQuery().where('s.id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException('Submission not found.');
    }
    if (actor.role === Role.STUDENT && row.studentId !== actor.studentProfileId) {
      throw new ForbiddenException('You can only view your own submissions.');
    }
    if (actor.role === Role.TEACHER) {
      await this.assertTeachesSubject(actor, row.assignment.subjectId);
    }
    return row;
  }

  private toView(row: Submission, actor: AuthenticatedUser): SubmissionView {
    // Students never see a score or feedback before the teacher releases it.
    const hidden = actor.role === Role.STUDENT && !row.isReleased;
    const graded = row.score !== null && !hidden;
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      assignmentTitle: row.assignment.title,
      subjectId: row.assignment.subjectId,
      subjectName: row.assignment.subject.name,
      maxMarks: row.assignment.maxMarks,
      dueAt: row.assignment.dueAt,
      studentId: row.studentId,
      studentName: row.student.user.fullName,
      studentCode: row.student.studentId,
      textAnswer: row.textAnswer,
      fileName: row.file?.originalName ?? null,
      fileSizeBytes: row.file?.sizeBytes ?? null,
      submittedAt: row.submittedAt,
      isLate: row.isLate,
      status: graded ? 'GRADED' : 'SUBMITTED',
      score: hidden ? null : row.score,
      feedback: hidden ? null : row.feedback,
      isReleased: row.isReleased,
      gradedAt: hidden ? null : row.gradedAt,
    };
  }
}
