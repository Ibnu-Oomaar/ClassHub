import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AccountStatus } from '../common/enums/account-status.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { ExaminationSubject } from '../examinations/examinations.entity';
import {
  ExaminationStatus,
  MARKS_ENTRY_EXAM_STATUSES,
  MARKS_EDITABLE_STATUSES,
  MarksStatus,
} from '../examinations/types/examination.types.interface';
import { GradingService } from '../grading/grading.service';
import { loadAppConfig } from '../config/app.config';
import { Student } from '../students/students.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { CreateMarkDto, MarkEntryDto } from './dto/create-mark.dto';
import { ConfirmMarkImportDto } from './dto/confirm-mark-import.dto';
import { MarksQueueQueryDto } from './dto/marks-queue-query.dto';
import { ReviewMarksDto } from './dto/review-marks.dto';
import { SaveMarksDto } from './dto/save-marks.dto';
import { UpdateMarkDto } from './dto/update-mark.dto';
import { Mark } from './marks.entity';
import { ExtractedMarkRecord, extractMarkRecords } from './marks-document.processor';
import {
  MAX_AUDITED_CHANGES,
  MarkEntryView,
  MarkSheetView,
  MarksQueueItem,
  ReviewDecision,
} from './types/mark.types.interface';

const cents = (value: number): number => Math.round(value * 100);
const round2 = (value: number): number => Math.round(value * 100) / 100;

const QUEUE_SORTABLE = {
  examDate: 'exam.examDate',
  subjectName: 'subject.name',
  submittedAt: 'es.submittedAt',
  status: 'es.marksStatus',
};

interface NormalizedEntry {
  studentId: string;
  score: number | null;
  isAbsent: boolean;
  remarks: string | null;
}

interface EntryChange {
  studentId: string;
  student: string;
  from: { score: number | null; absent: boolean } | null;
  to: { score: number | null; absent: boolean } | null;
}

export interface MarkImportPreviewRecord extends ExtractedMarkRecord {
  matchedStudentName: string | null;
  currentScore: number | null;
  issues: string[];
  valid: boolean;
}

export interface MarkImportPreview {
  maxMarks: number;
  records: MarkImportPreviewRecord[];
  summary: {
    totalRecords: number;
    matchedRecords: number;
    validScores: number;
    invalidRecords: number;
    unknownStudentIds: number;
    duplicateStudentIds: number;
    overwrites: number;
  };
}

@Injectable()
export class MarksService {
  private readonly maxImportBytes: number;

  constructor(
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    @InjectRepository(ExaminationSubject) private readonly examSubjects: Repository<ExaminationSubject>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    private readonly grading: GradingService,
    private readonly audit: AuditLogsService,
    config: ConfigService,
  ) {
    this.maxImportBytes = loadAppConfig(config).maxUploadBytes;
  }

  // ---------------------------------------------------------------------------------------------
  // Reading

  async getSheet(examinationSubjectId: string, actor: AuthenticatedUser): Promise<MarkSheetView> {
    const examSubject = await this.loadExamSubject(examinationSubjectId);
    await this.assertCanView(examSubject, actor);
    return this.buildSheet(examSubject, actor);
  }

  /** Class Master: sheets waiting for review (default). Teacher: their own sheets in any state. */
  async queue(query: MarksQueueQueryDto, actor: AuthenticatedUser): Promise<Paginated<MarksQueueItem>> {
    const qb = this.examSubjects
      .createQueryBuilder('es')
      .innerJoinAndSelect('es.examination', 'exam')
      .innerJoinAndSelect('es.subject', 'subject');

    const status = query.status ?? (actor.role === Role.CLASS_MASTER ? MarksStatus.SUBMITTED : undefined);
    if (status) qb.andWhere('es.marksStatus = :status', { status });

    if (actor.role === Role.TEACHER) {
      qb.andWhere('exam.status IN (:...entryStatuses)', { entryStatuses: MARKS_ENTRY_EXAM_STATUSES });
      qb.andWhere(
        `EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = es.subject_id AND ts.teacher_id = :ownTeacherId)`,
        { ownTeacherId: actor.teacherProfileId },
      );
    }
    if (query.examinationId) qb.andWhere('es.examinationId = :examinationId', { examinationId: query.examinationId });
    if (query.subjectId) qb.andWhere('es.subjectId = :subjectId', { subjectId: query.subjectId });
    if (query.search) {
      qb.andWhere(`(exam.name ILIKE :search ESCAPE '\\' OR subject.name ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    const waitingForReview = status === MarksStatus.SUBMITTED && !query.sortBy;
    qb.orderBy(
      waitingForReview ? 'es.submittedAt' : resolveSort(query.sortBy, QUEUE_SORTABLE, 'examDate'),
      waitingForReview ? 'ASC' : query.sortBy ? query.sortOrder : 'DESC',
    )
      .addOrderBy('subject.name', 'ASC')
      .addOrderBy('es.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const counts = await this.countEntered(rows.map((row) => row.id));

    const items: MarksQueueItem[] = rows.map((row) => ({
      examinationSubjectId: row.id,
      examinationId: row.examinationId,
      examinationName: row.examination.name,
      examDate: row.examination.examDate,
      subjectId: row.subjectId,
      subjectName: row.subject.name,
      maxMarks: row.maxMarks,
      marksStatus: row.marksStatus,
      reviewFeedback: row.reviewFeedback,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      entered: counts.get(row.id) ?? 0,
    }));
    return buildPaginated(items, total, query.page, query.limit);
  }

  // ---------------------------------------------------------------------------------------------
  // Teacher: entering marks

  /** Saves, changes or clears many entries of one sheet in a single transaction. */
  async saveEntries(examinationSubjectId: string, dto: SaveMarksDto, actor: AuthenticatedUser): Promise<MarkSheetView> {
    await this.applyEntries(examinationSubjectId, dto.entries, actor);
    return this.getSheet(examinationSubjectId, actor);
  }

  async previewImport(
    examinationSubjectId: string,
    file: Express.Multer.File | undefined,
    actor: AuthenticatedUser,
  ): Promise<MarkImportPreview> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a document to upload.');
    if (file.size > this.maxImportBytes) {
      throw new PayloadTooLargeException(`The document is larger than the ${Math.floor(this.maxImportBytes / (1024 * 1024))} MB limit.`);
    }

    const examSubject = await this.loadExamSubject(examinationSubjectId);
    await this.assertTeacherMayEdit(examSubject, actor);
    const extracted = await extractMarkRecords(file);
    const roster = await this.roster();
    const studentByCode = new Map<string, Student[]>();
    for (const student of roster) {
      const code = this.normalizeStudentCode(student.studentId);
      studentByCode.set(code, [...(studentByCode.get(code) ?? []), student]);
    }

    const recordCounts = new Map<string, number>();
    for (const record of extracted) {
      const code = this.normalizeStudentCode(record.studentId);
      if (code) recordCounts.set(code, (recordCounts.get(code) ?? 0) + 1);
    }

    const marks = await this.marks.find({ where: { examinationSubjectId } });
    const marksByStudent = new Map(marks.map((mark) => [mark.studentId, mark]));
    const records: MarkImportPreviewRecord[] = extracted.map((record) => {
      const code = this.normalizeStudentCode(record.studentId);
      const issues: string[] = [];
      if (!code) issues.push('Missing Student ID.');
      const duplicate = !!code && (recordCounts.get(code) ?? 0) > 1;
      if (duplicate) issues.push(`Duplicate Student ID "${record.studentId}". Remove or correct every duplicate record.`);

      const matches = code ? studentByCode.get(code) ?? [] : [];
      const student = matches.length === 1 ? matches[0] : undefined;
      if (code && matches.length === 0) issues.push(`Unknown Student ID "${record.studentId}".`);
      if (matches.length > 1) issues.push(`Student ID "${record.studentId}" matches more than one student and is ambiguous.`);
      if (student && student.user.status !== AccountStatus.ACTIVE) {
        issues.push(`Student "${record.studentId}" is not active and cannot receive marks.`);
      }

      const score = this.readImportedScore(record.score, examSubject.maxMarks);
      if (score.issue) issues.push(score.issue);
      const current = student ? marksByStudent.get(student.id) : undefined;
      if (current?.isAbsent) issues.push(`Student "${record.studentId}" is marked absent and cannot receive an imported score.`);

      return {
        ...record,
        matchedStudentName: student?.user.fullName ?? null,
        currentScore: current?.score ?? null,
        issues,
        valid: issues.length === 0,
      };
    });

    return {
      maxMarks: examSubject.maxMarks,
      records,
      summary: {
        totalRecords: records.length,
        matchedRecords: records.filter((record) => record.matchedStudentName !== null).length,
        validScores: records.filter((record) => record.valid).length,
        invalidRecords: records.filter((record) => !record.valid).length,
        unknownStudentIds: records.filter((record) => record.issues.some((issue) => issue.startsWith('Unknown Student ID'))).length,
        duplicateStudentIds: records.filter((record) => record.issues.some((issue) => issue.startsWith('Duplicate Student ID'))).length,
        overwrites: records.filter((record) => record.valid && record.currentScore !== null).length,
      },
    };
  }

  async confirmImport(
    examinationSubjectId: string,
    dto: ConfirmMarkImportDto,
    actor: AuthenticatedUser,
  ): Promise<MarkSheetView> {
    const result = await this.marks.manager.transaction(async (manager) => {
      const examSubject = await this.lockExamSubject(manager, examinationSubjectId);
      await this.assertTeacherMayEdit(examSubject, actor, manager);
      const roster = new Map((await this.roster(manager)).map((student) => [this.normalizeStudentCode(student.studentId), student]));
      const seen = new Set<string>();
      const validated = dto.entries.map((entry) => {
        const code = this.normalizeStudentCode(entry.studentCode);
        if (!code || seen.has(code)) throw new BadRequestException(`Student ID "${entry.studentCode}" is missing or duplicated.`);
        seen.add(code);
        const student = roster.get(code);
        if (!student) throw new BadRequestException(`Unknown Student ID "${entry.studentCode}".`);
        if (student.user.status !== AccountStatus.ACTIVE) {
          throw new BadRequestException(`Student "${entry.studentCode}" is not active and cannot receive marks.`);
        }
        const score = this.readImportedScore(String(entry.score), examSubject.maxMarks);
        if (score.issue || score.value === null) {
          throw new BadRequestException(`Student "${entry.studentCode}": ${score.issue ?? 'Score is invalid.'}`);
        }
        return {
          student,
          score: score.value,
          studentCode: entry.studentCode,
          expectedCurrentScore: entry.expectedCurrentScore,
        };
      });

      const repository = manager.getRepository(Mark);
      const existing = await repository.find({
        where: { examinationSubjectId, studentId: In(validated.map(({ student }) => student.id)) },
      });
      const existingByStudent = new Map(existing.map((mark) => [mark.studentId, mark]));
      const overwrites = validated.filter(({ student }) => {
        const current = existingByStudent.get(student.id);
        if (current?.isAbsent) {
          throw new BadRequestException(`Student ID "${student.studentId}" is marked absent and cannot receive an imported score.`);
        }
        return current?.score !== null && current?.score !== undefined;
      });
      for (const { student, expectedCurrentScore } of validated) {
        const currentScore = existingByStudent.get(student.id)?.score ?? null;
        if (expectedCurrentScore !== currentScore) {
          throw new ConflictException('Scores changed after the preview. Upload and review the document again before confirming.');
        }
      }
      if (overwrites.length > 0 && !dto.overwriteExisting) {
        throw new ConflictException('Existing scores would be overwritten. Review the current and incoming scores and explicitly confirm the overwrite.');
      }

      const changes: EntryChange[] = [];
      let created = 0;
      let updated = 0;
      for (const { student, score } of validated) {
        const current = existingByStudent.get(student.id);
        if (current) {
          await repository.update({ id: current.id }, { score });
          updated++;
          changes.push({
            studentId: student.id,
            student: student.user.fullName,
            from: { score: current.score, absent: current.isAbsent },
            to: { score, absent: false },
          });
        } else {
          await repository.save(
            repository.create({
              examinationSubjectId,
              studentId: student.id,
              score,
              isAbsent: false,
              enteredById: actor.id,
            }),
          );
          created++;
          changes.push({ studentId: student.id, student: student.user.fullName, from: null, to: { score, absent: false } });
        }
      }

      if (examSubject.marksStatus === MarksStatus.PENDING && created + updated > 0) {
        await manager.getRepository(ExaminationSubject).update({ id: examinationSubjectId }, { marksStatus: MarksStatus.DRAFT });
      }
      return { created, updated, changes, examinationId: examSubject.examinationId, subjectId: examSubject.subjectId };
    });

    await this.audit.record({
      actor,
      action: result.updated > 0 ? AuditAction.MARKS_UPDATED : AuditAction.MARKS_SAVED,
      entityType: 'ExaminationSubject',
      entityId: examinationSubjectId,
      summary: `Marks imported: ${result.created} added, ${result.updated} changed`,
      details: {
        examinationId: result.examinationId,
        subjectId: result.subjectId,
        created: result.created,
        updated: result.updated,
        changes: result.changes.slice(0, MAX_AUDITED_CHANGES),
        changesTruncated: result.changes.length > MAX_AUDITED_CHANGES,
      },
    });

    return this.getSheet(examinationSubjectId, actor);
  }

  async createMark(dto: CreateMarkDto, actor: AuthenticatedUser): Promise<MarkEntryView> {
    const existing = await this.marks.exists({
      where: { examinationSubjectId: dto.examinationSubjectId, studentId: dto.studentId },
    });
    if (existing) {
      throw new ConflictException('A mark already exists for this student. Update it instead.');
    }
    await this.applyEntries(dto.examinationSubjectId, [dto], actor);
    return this.entryFor(dto.examinationSubjectId, dto.studentId, actor);
  }

  async updateMark(markId: string, dto: UpdateMarkDto, actor: AuthenticatedUser): Promise<MarkEntryView> {
    const mark = await this.findMarkOrFail(markId);

    let isAbsent = dto.isAbsent ?? mark.isAbsent;
    let score = dto.score !== undefined ? dto.score : mark.score;
    // Typing a score means the student was present; marking absent without a score drops the old score.
    if (dto.score != null && dto.isAbsent === undefined) isAbsent = false;
    if (isAbsent && dto.score === undefined) score = null;

    await this.applyEntries(
      mark.examinationSubjectId,
      [{ studentId: mark.studentId, score, isAbsent, remarks: dto.remarks !== undefined ? dto.remarks : mark.remarks }],
      actor,
    );
    return this.entryFor(mark.examinationSubjectId, mark.studentId, actor);
  }

  async deleteMark(markId: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const mark = await this.findMarkOrFail(markId);
    await this.applyEntries(mark.examinationSubjectId, [{ studentId: mark.studentId, score: null, isAbsent: false }], actor);
    return { deleted: true };
  }

  /** Locks the sheet for review. Every student of the class needs a score or an absent flag first. */
  async submit(examinationSubjectId: string, actor: AuthenticatedUser): Promise<MarkSheetView> {
    const summary = await this.students.manager.transaction(async (manager) => {
      const examSubject = await this.lockExamSubject(manager, examinationSubjectId);
      await this.assertTeacherMayEdit(examSubject, actor, manager);

      const roster = await this.roster(manager);
      if (roster.length === 0) {
        throw new BadRequestException('There are no students in the class yet, so there is nothing to submit.');
      }

      const entered = await manager.getRepository(Mark).find({ where: { examinationSubjectId } });
      const complete = new Set(entered.filter((mark) => mark.score !== null || mark.isAbsent).map((mark) => mark.studentId));
      const missing = roster.filter((student) => !complete.has(student.id));
      if (missing.length > 0) {
        const names = missing.slice(0, 5).map((student) => student.user.fullName).join(', ');
        throw new BadRequestException(
          `${missing.length} student${missing.length === 1 ? ' has' : 's have'} no mark yet (${names}${missing.length > 5 ? ', ...' : ''}). Enter a score or mark them absent.`,
        );
      }

      await manager.getRepository(ExaminationSubject).update(
        { id: examinationSubjectId },
        {
          marksStatus: MarksStatus.SUBMITTED,
          submittedAt: new Date(),
          submittedById: actor.id,
          reviewedAt: null,
          reviewedById: null,
          reviewFeedback: null,
        },
      );
      return { examinationId: examSubject.examinationId, subjectId: examSubject.subjectId, students: roster.length };
    });

    await this.audit.record({
      actor,
      action: AuditAction.MARKS_SUBMITTED,
      entityType: 'ExaminationSubject',
      entityId: examinationSubjectId,
      summary: 'Submitted marks for review',
      details: summary,
    });

    return this.getSheet(examinationSubjectId, actor);
  }

  // ---------------------------------------------------------------------------------------------
  // Class Master: reviewing marks

  async review(examinationSubjectId: string, dto: ReviewMarksDto, actor: AuthenticatedUser): Promise<MarkSheetView> {
    const outcome = await this.examSubjects.manager.transaction(async (manager) => {
      const examSubject = await this.lockExamSubject(manager, examinationSubjectId);
      const examination = examSubject.examination;
      if (examination.resultsPublishedAt) {
        throw new ConflictException('Results are published. Unpublish them before changing the review of these marks.');
      }

      const repository = manager.getRepository(ExaminationSubject);
      if (dto.decision === ReviewDecision.APPROVE) {
        if (examSubject.marksStatus !== MarksStatus.SUBMITTED) {
          throw new ConflictException('Only submitted marks can be approved.');
        }
        await repository.update(
          { id: examinationSubjectId },
          { marksStatus: MarksStatus.APPROVED, reviewedAt: new Date(), reviewedById: actor.id, reviewFeedback: null },
        );
        return MarksStatus.APPROVED;
      }

      // Rejecting also works on approved marks, so an approval can be taken back before publishing.
      if (examSubject.marksStatus !== MarksStatus.SUBMITTED && examSubject.marksStatus !== MarksStatus.APPROVED) {
        throw new ConflictException('Only submitted or approved marks can be rejected.');
      }
      await repository.update(
        { id: examinationSubjectId },
        { marksStatus: MarksStatus.REJECTED, reviewedAt: new Date(), reviewedById: actor.id, reviewFeedback: dto.feedback ?? null },
      );
      return MarksStatus.REJECTED;
    });

    await this.audit.record({
      actor,
      action: outcome === MarksStatus.APPROVED ? AuditAction.MARKS_APPROVED : AuditAction.MARKS_REJECTED,
      entityType: 'ExaminationSubject',
      entityId: examinationSubjectId,
      summary: outcome === MarksStatus.APPROVED ? 'Approved marks' : 'Rejected marks and returned them to the teacher',
      details: outcome === MarksStatus.REJECTED ? { feedback: dto.feedback } : undefined,
    });

    return this.getSheet(examinationSubjectId, actor);
  }

  // ---------------------------------------------------------------------------------------------
  // Internals

  /**
   * Validates and applies entries inside one transaction. The sheet row is locked first, so a
   * save can never overlap a submit or a review of the same sheet.
   */
  private async applyEntries(examinationSubjectId: string, entries: MarkEntryDto[], actor: AuthenticatedUser): Promise<void> {
    const result = await this.marks.manager.transaction(async (manager) => {
      const examSubject = await this.lockExamSubject(manager, examinationSubjectId);
      await this.assertTeacherMayEdit(examSubject, actor, manager);

      const roster = new Map((await this.roster(manager)).map((student) => [student.id, student]));
      const normalized = this.normalizeEntries(entries, roster, examSubject.maxMarks);

      const repository = manager.getRepository(Mark);
      const existing = await repository.find({
        where: { examinationSubjectId, studentId: In(normalized.map((entry) => entry.studentId)) },
      });
      const existingByStudent = new Map(existing.map((mark) => [mark.studentId, mark]));

      const changes: EntryChange[] = [];
      let created = 0;
      let updated = 0;
      let cleared = 0;

      for (const entry of normalized) {
        const current = existingByStudent.get(entry.studentId);
        const studentName = roster.get(entry.studentId)!.user.fullName;
        const clearing = entry.score === null && !entry.isAbsent;

        if (clearing) {
          if (current) {
            await repository.delete({ id: current.id });
            cleared++;
            changes.push({ studentId: entry.studentId, student: studentName, from: { score: current.score, absent: current.isAbsent }, to: null });
          }
          continue;
        }

        if (!current) {
          await repository.save(
            repository.create({
              examinationSubjectId,
              studentId: entry.studentId,
              score: entry.score,
              isAbsent: entry.isAbsent,
              remarks: entry.remarks,
              enteredById: actor.id,
            }),
          );
          created++;
          changes.push({ studentId: entry.studentId, student: studentName, from: null, to: { score: entry.score, absent: entry.isAbsent } });
          continue;
        }

        const differs =
          current.score !== entry.score || current.isAbsent !== entry.isAbsent || (current.remarks ?? null) !== entry.remarks;
        if (differs) {
          await repository.update(
            { id: current.id },
            { score: entry.score, isAbsent: entry.isAbsent, remarks: entry.remarks, enteredById: actor.id },
          );
          updated++;
          if (current.score !== entry.score || current.isAbsent !== entry.isAbsent) {
            changes.push({
              studentId: entry.studentId,
              student: studentName,
              from: { score: current.score, absent: current.isAbsent },
              to: { score: entry.score, absent: entry.isAbsent },
            });
          }
        }
      }

      if (examSubject.marksStatus === MarksStatus.PENDING && created + updated > 0) {
        await manager.getRepository(ExaminationSubject).update({ id: examinationSubjectId }, { marksStatus: MarksStatus.DRAFT });
      }

      return { created, updated, cleared, changes, examinationId: examSubject.examinationId, subjectId: examSubject.subjectId };
    });

    if (result.created + result.updated + result.cleared === 0) {
      return;
    }

    await this.audit.record({
      actor,
      action: result.updated + result.cleared > 0 ? AuditAction.MARKS_UPDATED : AuditAction.MARKS_SAVED,
      entityType: 'ExaminationSubject',
      entityId: examinationSubjectId,
      summary: `Marks saved: ${result.created} added, ${result.updated} changed, ${result.cleared} cleared`,
      details: {
        examinationId: result.examinationId,
        subjectId: result.subjectId,
        created: result.created,
        updated: result.updated,
        cleared: result.cleared,
        changes: result.changes.slice(0, MAX_AUDITED_CHANGES),
        changesTruncated: result.changes.length > MAX_AUDITED_CHANGES,
      },
    });
  }

  /** Checks every entry against the roster and the subject's maximum; reports all problems at once. */
  private normalizeEntries(entries: MarkEntryDto[], roster: Map<string, Student>, maxMarks: number): NormalizedEntry[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    const normalized: NormalizedEntry[] = [];

    for (const entry of entries) {
      const student = roster.get(entry.studentId);
      if (!student) {
        problems.push('One of the students is not in the class.');
        continue;
      }
      const name = student.user.fullName;
      if (seen.has(entry.studentId)) {
        problems.push(`${name} appears more than once.`);
        continue;
      }
      seen.add(entry.studentId);

      const isAbsent = entry.isAbsent === true;
      const score = entry.score ?? null;

      if (isAbsent && score !== null) {
        problems.push(`${name} is marked absent, so a score cannot be entered.`);
        continue;
      }
      if (score !== null && cents(score) > cents(maxMarks)) {
        problems.push(`${name}: ${score} is above the maximum of ${maxMarks}.`);
        continue;
      }
      normalized.push({ studentId: entry.studentId, score, isAbsent, remarks: entry.remarks ?? null });
    }

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
    return normalized;
  }

  private async buildSheet(examSubject: ExaminationSubject, actor: AuthenticatedUser): Promise<MarkSheetView> {
    const roster = await this.roster();
    const marks = await this.marks.find({ where: { examinationSubjectId: examSubject.id } });
    const markByStudent = new Map(marks.map((mark) => [mark.studentId, mark]));
    const bands = await this.grading.loadActiveBands();
    const published = examSubject.examination.resultsPublishedAt !== null;

    let entered = 0;
    const entries: MarkEntryView[] = roster.map((student) => {
      const mark = markByStudent.get(student.id);
      const hasEntry = !!mark && (mark.score !== null || mark.isAbsent);
      if (hasEntry) entered++;

      const percentage =
        mark && mark.score !== null && examSubject.maxMarks > 0 ? round2((cents(mark.score) / cents(examSubject.maxMarks)) * 100) : null;
      const grade = published && mark ? mark.grade : mark?.score !== null && mark?.score !== undefined ? this.grading.gradeWith(mark.score, bands).grade : null;

      return {
        markId: mark?.id ?? null,
        studentId: student.id,
        studentName: student.user.fullName,
        studentCode: student.studentId,
        score: mark?.score ?? null,
        isAbsent: mark?.isAbsent ?? false,
        remarks: mark?.remarks ?? null,
        percentage,
        grade,
      };
    });

    return {
      examinationSubjectId: examSubject.id,
      examinationId: examSubject.examinationId,
      examinationName: examSubject.examination.name,
      examinationStatus: examSubject.examination.status,
      examDate: examSubject.examination.examDate,
      subjectId: examSubject.subjectId,
      subjectName: examSubject.subject.name,
      maxMarks: examSubject.maxMarks,
      marksStatus: examSubject.marksStatus,
      reviewFeedback: examSubject.reviewFeedback,
      submittedAt: examSubject.submittedAt,
      reviewedAt: examSubject.reviewedAt,
      resultsPublished: published,
      canEdit:
        actor.role === Role.TEACHER &&
        MARKS_EDITABLE_STATUSES.includes(examSubject.marksStatus) &&
        MARKS_ENTRY_EXAM_STATUSES.includes(examSubject.examination.status),
      gradingConfigured: bands.length > 0,
      entered,
      total: roster.length,
      entries,
    };
  }

  private async entryFor(examinationSubjectId: string, studentId: string, actor: AuthenticatedUser): Promise<MarkEntryView> {
    const sheet = await this.getSheet(examinationSubjectId, actor);
    const entry = sheet.entries.find((candidate) => candidate.studentId === studentId);
    if (!entry) {
      throw new NotFoundException('Student not found in this mark sheet.');
    }
    return entry;
  }

  /** Everyone currently in the class: all students that have not been removed, ordered by name. */
  private roster(manager?: EntityManager): Promise<Student[]> {
    const repository = manager ? manager.getRepository(Student) : this.students;
    return repository
      .createQueryBuilder('student')
      .innerJoinAndSelect('student.user', 'user')
      .orderBy('user.fullName', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .getMany();
  }

  private async countEntered(ids: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (ids.length === 0) return result;
    const rows = await this.marks
      .createQueryBuilder('mark')
      .select('mark.examinationSubjectId', 'id')
      .addSelect('COUNT(*)', 'count')
      .where('mark.examinationSubjectId IN (:...ids)', { ids })
      .andWhere('(mark.score IS NOT NULL OR mark.isAbsent = true)')
      .groupBy('mark.examinationSubjectId')
      .getRawMany<{ id: string; count: string }>();
    for (const row of rows) result.set(row.id, parseInt(row.count, 10));
    return result;
  }

  private async loadExamSubject(id: string): Promise<ExaminationSubject> {
    const examSubject = await this.examSubjects.findOne({ where: { id }, relations: { examination: true, subject: true } });
    if (!examSubject) {
      throw new NotFoundException('Mark sheet not found.');
    }
    return examSubject;
  }

  /** Loads the sheet with a row lock held until the surrounding transaction ends. */
  private async lockExamSubject(manager: EntityManager, id: string): Promise<ExaminationSubject> {
    const locked = await manager.getRepository(ExaminationSubject).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!locked) {
      throw new NotFoundException('Mark sheet not found.');
    }
    return manager.getRepository(ExaminationSubject).findOneOrFail({ where: { id }, relations: { examination: true, subject: true } });
  }

  private async findMarkOrFail(id: string): Promise<Mark> {
    const mark = await this.marks.findOne({ where: { id } });
    if (!mark) {
      throw new NotFoundException('Mark not found.');
    }
    return mark;
  }

  private async assertOwnsSubject(actor: AuthenticatedUser, subjectId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(TeacherSubject) : this.teacherSubjects;
    const owns = await repository.exists({ where: { teacherId: actor.teacherProfileId ?? '', subjectId } });
    if (!owns) {
      throw new ForbiddenException('You are not assigned to this subject.');
    }
  }

  private async assertCanView(examSubject: ExaminationSubject, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === Role.CLASS_MASTER) return;
    if (actor.role !== Role.TEACHER) {
      throw new ForbiddenException('You do not have permission to view mark sheets.');
    }
    await this.assertOwnsSubject(actor, examSubject.subjectId);
    if (examSubject.examination.status === ExaminationStatus.DRAFT) {
      throw new NotFoundException('Mark sheet not found.');
    }
  }

  /** Only a teacher assigned to the subject may enter marks, and only while the sheet is open for editing. */
  private async assertTeacherMayEdit(examSubject: ExaminationSubject, actor: AuthenticatedUser, manager?: EntityManager): Promise<void> {
    if (actor.role !== Role.TEACHER) {
      throw new ForbiddenException('Only the subject teacher can enter marks.');
    }
    await this.assertOwnsSubject(actor, examSubject.subjectId, manager);

    if (!MARKS_ENTRY_EXAM_STATUSES.includes(examSubject.examination.status)) {
      throw new ConflictException('Marks can only be entered for scheduled or completed examinations.');
    }
    if (!MARKS_EDITABLE_STATUSES.includes(examSubject.marksStatus)) {
      throw new ConflictException(
        examSubject.marksStatus === MarksStatus.APPROVED
          ? 'These marks are approved and locked.'
          : 'These marks are submitted and waiting for the Class Master. They are locked until reviewed.',
      );
    }
  }

  private normalizeStudentCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private readImportedScore(raw: string, maxMarks: number): { value: number | null; issue?: string } {
    const valueText = raw.trim();
    if (!valueText) return { value: null, issue: 'Missing score.' };
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(valueText)) return { value: null, issue: `Invalid or unreadable score "${valueText}".` };
    const value = Number(valueText);
    if (!Number.isFinite(value)) return { value: null, issue: `Invalid score "${valueText}".` };
    if (value < 0) return { value: null, issue: `Score ${valueText} cannot be negative.` };
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      return { value: null, issue: `Score ${valueText} has more than 2 decimal places and cannot be rounded automatically.` };
    }
    if (cents(value) > cents(maxMarks)) return { value: null, issue: `Score ${valueText} is above the maximum of ${maxMarks}.` };
    return { value };
  }
}
