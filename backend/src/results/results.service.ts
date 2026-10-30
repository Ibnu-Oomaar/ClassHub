import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { Examination, ExaminationSubject } from '../examinations/examinations.entity';
import { ExaminationStatus, MarksStatus } from '../examinations/types/examination.types.interface';
import { GradeBand } from '../grading/grading.entity';
import { GradingService } from '../grading/grading.service';
import { Mark } from '../marks/marks.entity';
import { PublishResultDto } from './dto/publish-result.dto';
import { ResultQueryDto } from './dto/result-query.dto';
import { Result } from './results.entity';
import { StandingInput, computeStandings, fromCents, percentageOf, toCents } from './standings';
import {
  ExaminationStandingsView,
  MyResultDetail,
  MyResultSummary,
  PublishOutcome,
  ResultSubjectView,
  StandingRowView,
} from './types/result.types.interface';

type MarkWithStudent = Mark & { student: NonNullable<Mark['student']> & { user: { fullName: string } } };

@Injectable()
export class ResultsService {
  constructor(
    @InjectRepository(Result) private readonly results: Repository<Result>,
    @InjectRepository(Examination) private readonly exams: Repository<Examination>,
    @InjectRepository(ExaminationSubject) private readonly examSubjects: Repository<ExaminationSubject>,
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    private readonly grading: GradingService,
    private readonly audit: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Class Master: standings, publish, unpublish

  /**
   * Standings of one examination. Before publication they are calculated live from the APPROVED
   * marks (a preview); afterwards the frozen values written at publication are returned.
   */
  async getStandings(examinationId: string): Promise<ExaminationStandingsView> {
    const exam = await this.loadExamination(examinationId);
    const examSubjects = await this.examSubjects.find({ where: { examinationId }, relations: { subject: true } });
    const approved = examSubjects.filter((row) => row.marksStatus === MarksStatus.APPROVED);
    const published = exam.resultsPublishedAt !== null;
    // Published results are history: students who were removed after publication keep their frozen row.
    const marks = await this.loadMarks(approved.map((row) => row.id), undefined, published);
    const activeScale = await this.grading.loadActiveScale();
    const bands = activeScale?.bands ?? [];

    const blockers: string[] = [];
    if (exam.status === ExaminationStatus.DRAFT || exam.status === ExaminationStatus.CANCELLED) {
      blockers.push(`The examination is ${exam.status.toLowerCase()}.`);
    }
    for (const row of examSubjects) {
      if (row.marksStatus !== MarksStatus.APPROVED) {
        blockers.push(`${row.subject.name}: marks are ${row.marksStatus.toLowerCase()}, not approved.`);
      }
    }
    if (bands.length === 0) {
      blockers.push('No grading scale is active. Create and activate one under Grading.');
    }

    const rows = published
      ? await this.publishedRows(examinationId, approved, marks)
      : this.liveRows(approved, marks, bands, activeScale?.maxMark ?? 0);

    return {
      examinationId: exam.id,
      examinationName: exam.name,
      published,
      publishedAt: exam.resultsPublishedAt,
      subjectsTotal: examSubjects.length,
      subjectsApproved: approved.length,
      readyToPublish: !published && blockers.length === 0 && examSubjects.length > 0,
      gradingConfigured: bands.length > 0,
      blockers: published ? [] : blockers,
      classSize: rows.length,
      rows,
    };
  }

  /** Paginated, searchable view of the standings (Class Master). */
  async list(query: ResultQueryDto): Promise<Paginated<StandingRowView>> {
    const standings = await this.getStandings(query.examinationId);
    let rows = standings.rows;

    if (query.search) {
      const needle = query.search.toLocaleLowerCase('en');
      rows = rows.filter((row) => row.studentName.toLocaleLowerCase('en').includes(needle) || row.studentCode.toLowerCase().includes(needle));
    }

    const direction = query.sortBy && query.sortOrder === 'DESC' ? -1 : 1;
    const sorters: Record<string, (a: StandingRowView, b: StandingRowView) => number> = {
      rank: (a, b) => a.rank - b.rank,
      name: (a, b) => a.studentName.localeCompare(b.studentName),
      percentage: (a, b) => a.percentage - b.percentage,
    };
    const sorter = sorters[query.sortBy ?? 'rank'] ?? sorters.rank;
    rows = [...rows].sort((a, b) => sorter(a, b) * direction || a.rank - b.rank);

    const total = rows.length;
    const page = rows.slice(skipFor(query.page, query.limit), skipFor(query.page, query.limit) + query.limit);
    return buildPaginated(page, total, query.page, query.limit);
  }

  async publish(dto: PublishResultDto, actor: AuthenticatedUser): Promise<PublishOutcome> {
    const outcome = await this.exams.manager.transaction(async (manager) => {
      const exam = await this.lockExamination(manager, dto.examinationId);
      if (exam.resultsPublishedAt) {
        throw new ConflictException('These results are already published.');
      }
      if (exam.status === ExaminationStatus.DRAFT || exam.status === ExaminationStatus.CANCELLED) {
        throw new ConflictException(`A ${exam.status.toLowerCase()} examination cannot have its results published.`);
      }

      const examSubjects = await manager.getRepository(ExaminationSubject).find({
        where: { examinationId: exam.id },
        relations: { subject: true },
      });
      if (examSubjects.length === 0) {
        throw new ConflictException('This examination has no subjects.');
      }
      const notApproved = examSubjects.filter((row) => row.marksStatus !== MarksStatus.APPROVED);
      if (notApproved.length > 0) {
        throw new ConflictException(`Approve the marks first. Still waiting: ${notApproved.map((row) => row.subject.name).join(', ')}.`);
      }

      const activeScale = await this.grading.loadActiveScale(manager);
      const bands = activeScale?.bands ?? [];
      if (bands.length === 0) {
        throw new BadRequestException('Create and activate a grading scale before publishing results.');
      }

      const marks = await this.loadMarks(
        examSubjects.map((row) => row.id),
        manager,
      );
      if (marks.length === 0) {
        throw new ConflictException('No marks have been entered, so there is nothing to publish.');
      }

      const maxByExamSubject = new Map(examSubjects.map((row) => [row.id, row.maxMarks]));
      const standings = computeStandings(this.toInputs(marks, maxByExamSubject));
      const now = new Date();

      // Freeze each subject grade, so later edits to the grading scale never change published results.
      const idsByGrade = new Map<string | null, string[]>();
      for (const mark of marks) {
        const grade = mark.score === null ? null : this.grading.gradeWith(mark.score, bands).grade;
        const ids = idsByGrade.get(grade) ?? [];
        ids.push(mark.id);
        idsByGrade.set(grade, ids);
      }
      for (const [grade, ids] of idsByGrade) {
        await manager.getRepository(Mark).update({ id: In(ids) }, { grade });
      }

      const resultRepository = manager.getRepository(Result);
      await resultRepository.delete({ examinationId: exam.id });
      await resultRepository.save(
        standings.map((standing) => {
          const band = this.grading.gradeAtPercentage(standing.percentage, activeScale!.maxMark, bands);
          return resultRepository.create({
            examinationId: exam.id,
            studentId: standing.studentId,
            totalScore: fromCents(standing.totalScoreCents),
            totalMax: fromCents(standing.totalMaxCents),
            percentage: standing.percentage,
            grade: band.grade,
            gradeRemark: band.remark,
            isPassing: band.isPassing,
            rank: standing.rank,
            subjectsCount: standing.subjectsCount,
            publishedAt: now,
          });
        }),
      );

      await manager
        .getRepository(Examination)
        .update({ id: exam.id }, { resultsPublishedAt: now, resultsPublishedById: actor.id });

      const names = new Map(marks.map((mark) => [mark.studentId, mark.student.user.fullName]));
      const warnings = standings
        .filter((standing) => standing.subjectsCount < examSubjects.length)
        .map((standing) => `${names.get(standing.studentId)} has marks in ${standing.subjectsCount} of ${examSubjects.length} subjects.`);

      return {
        examinationId: exam.id,
        examinationName: exam.name,
        published: true,
        publishedAt: now,
        students: standings.length,
        warnings,
      };
    });

    await this.audit.record({
      actor,
      action: AuditAction.RESULTS_PUBLISHED,
      entityType: 'Examination',
      entityId: outcome.examinationId,
      summary: `Published results of ${outcome.examinationName} for ${outcome.students} students`,
      details: { students: outcome.students, warnings: outcome.warnings.length },
    });

    return {
      examinationId: outcome.examinationId,
      published: outcome.published,
      publishedAt: outcome.publishedAt,
      students: outcome.students,
      warnings: outcome.warnings,
    };
  }

  /** Hides the results from students again and discards the frozen values. Re-publishing recalculates them. */
  async unpublish(dto: PublishResultDto, actor: AuthenticatedUser): Promise<PublishOutcome> {
    const name = await this.exams.manager.transaction(async (manager) => {
      const exam = await this.lockExamination(manager, dto.examinationId);
      if (!exam.resultsPublishedAt) {
        throw new ConflictException('These results are not published.');
      }

      const examSubjectIds = (
        await manager.getRepository(ExaminationSubject).find({ where: { examinationId: exam.id }, select: { id: true } })
      ).map((row) => row.id);

      await manager.getRepository(Result).delete({ examinationId: exam.id });
      if (examSubjectIds.length > 0) {
        await manager.getRepository(Mark).update({ examinationSubjectId: In(examSubjectIds) }, { grade: null });
      }
      await manager.getRepository(Examination).update({ id: exam.id }, { resultsPublishedAt: null, resultsPublishedById: null });
      return exam.name;
    });

    await this.audit.record({
      actor,
      action: AuditAction.RESULTS_UNPUBLISHED,
      entityType: 'Examination',
      entityId: dto.examinationId,
      summary: `Unpublished results of ${name}`,
    });

    return { examinationId: dto.examinationId, published: false, publishedAt: null, students: 0, warnings: [] };
  }

  // ---------------------------------------------------------------------------------------------
  // Student: own published results only. The student is always taken from the token, never from input.

  async myResults(actor: AuthenticatedUser): Promise<MyResultSummary[]> {
    const studentId = this.requireStudent(actor);
    const rows = await this.results
      .createQueryBuilder('result')
      .innerJoinAndSelect('result.examination', 'exam')
      .where('result.studentId = :studentId', { studentId })
      .andWhere('exam.resultsPublishedAt IS NOT NULL')
      .orderBy('exam.examDate', 'DESC')
      .addOrderBy('exam.name', 'ASC')
      .getMany();

    const sizes = await this.classSizes(rows.map((row) => row.examinationId));
    return rows.map((row) => this.toSummary(row, sizes.get(row.examinationId) ?? 1));
  }

  async myResult(examinationId: string, actor: AuthenticatedUser): Promise<MyResultDetail> {
    const studentId = this.requireStudent(actor);
    const row = await this.results
      .createQueryBuilder('result')
      .innerJoinAndSelect('result.examination', 'exam')
      .where('result.studentId = :studentId', { studentId })
      .andWhere('result.examinationId = :examinationId', { examinationId })
      .andWhere('exam.resultsPublishedAt IS NOT NULL')
      .getOne();
    if (!row) {
      throw new NotFoundException('No published result found for this examination.');
    }

    const marks = await this.marks
      .createQueryBuilder('mark')
      .innerJoinAndSelect('mark.examinationSubject', 'es')
      .innerJoinAndSelect('es.subject', 'subject')
      .where('mark.studentId = :studentId', { studentId })
      .andWhere('es.examinationId = :examinationId', { examinationId })
      .orderBy('subject.name', 'ASC')
      .getMany();

    const sizes = await this.classSizes([examinationId]);
    return {
      ...this.toSummary(row, sizes.get(examinationId) ?? 1),
      subjects: marks.map((mark) => this.subjectView(mark.examinationSubject, mark.score, mark.isAbsent, mark.grade)),
    };
  }

  // ---------------------------------------------------------------------------------------------

  private requireStudent(actor: AuthenticatedUser): string {
    if (!actor.studentProfileId) {
      throw new ForbiddenException('This account has no student profile.');
    }
    return actor.studentProfileId;
  }

  private async loadExamination(id: string): Promise<Examination> {
    const exam = await this.exams.findOne({ where: { id } });
    if (!exam) {
      throw new NotFoundException('Examination not found.');
    }
    return exam;
  }

  private async lockExamination(manager: EntityManager, id: string): Promise<Examination> {
    const exam = await manager.getRepository(Examination).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!exam) {
      throw new NotFoundException('Examination not found.');
    }
    return exam;
  }

  /** Marks of the given examination subjects. Students that were removed are left out unless `includeRemoved` is set. */
  private async loadMarks(examinationSubjectIds: string[], manager?: EntityManager, includeRemoved = false): Promise<MarkWithStudent[]> {
    if (examinationSubjectIds.length === 0) return [];
    const repository = manager ? manager.getRepository(Mark) : this.marks;
    const qb = repository.createQueryBuilder('mark');
    if (includeRemoved) qb.withDeleted();
    return (await qb
      .innerJoinAndSelect('mark.student', 'student')
      .innerJoinAndSelect('student.user', 'user')
      .where('mark.examinationSubjectId IN (:...ids)', { ids: examinationSubjectIds })
      .getMany()) as MarkWithStudent[];
  }

  private toInputs(marks: MarkWithStudent[], maxByExamSubject: Map<string, number>): StandingInput[] {
    const byStudent = new Map<string, StandingInput>();
    for (const mark of marks) {
      const input = byStudent.get(mark.studentId) ?? { studentId: mark.studentId, marks: [] };
      input.marks.push({
        subjectId: mark.examinationSubjectId,
        maxCents: toCents(maxByExamSubject.get(mark.examinationSubjectId)!),
        scoreCents: mark.score === null ? 0 : toCents(mark.score),
      });
      byStudent.set(mark.studentId, input);
    }
    return [...byStudent.values()];
  }

  private subjectView(examSubject: ExaminationSubject & { subject: { id: string; name: string } }, score: number | null, isAbsent: boolean, grade: string | null): ResultSubjectView {
    return {
      subjectId: examSubject.subjectId,
      subjectName: examSubject.subject.name,
      score,
      maxMarks: examSubject.maxMarks,
      percentage: score === null ? null : percentageOf(toCents(score), toCents(examSubject.maxMarks)),
      grade,
      isAbsent,
    };
  }

  /** Preview from approved marks and the active scale. Nothing is stored. */
  private liveRows(approved: ExaminationSubject[], marks: MarkWithStudent[], bands: GradeBand[], scaleMaxMark: number): StandingRowView[] {
    const examSubjectById = new Map(approved.map((row) => [row.id, row]));
    const maxByExamSubject = new Map(approved.map((row) => [row.id, row.maxMarks]));
    const standings = computeStandings(this.toInputs(marks, maxByExamSubject));
    const marksByStudent = this.groupByStudent(marks);

    return standings.map((standing) => {
      const studentMarks = marksByStudent.get(standing.studentId)!;
      const band = this.grading.gradeAtPercentage(standing.percentage, scaleMaxMark, bands);
      return {
        rank: standing.rank,
        studentId: standing.studentId,
        studentName: studentMarks[0].student.user.fullName,
        studentCode: studentMarks[0].student.studentId,
        totalScore: fromCents(standing.totalScoreCents),
        totalMax: fromCents(standing.totalMaxCents),
        percentage: standing.percentage,
        grade: band.grade,
        gradeRemark: band.remark,
        isPassing: band.isPassing,
        subjectsCount: standing.subjectsCount,
        subjects: this.sortedSubjects(
          studentMarks.map((mark) => {
            const examSubject = examSubjectById.get(mark.examinationSubjectId)! as ExaminationSubject & { subject: { id: string; name: string } };
            const grade =
              mark.score === null
                ? null
                : this.grading.gradeWith(mark.score, bands).grade;
            return this.subjectView(examSubject, mark.score, mark.isAbsent, grade);
          }),
        ),
      };
    });
  }

  /** Frozen values written at publication. */
  private async publishedRows(examinationId: string, approved: ExaminationSubject[], marks: MarkWithStudent[]): Promise<StandingRowView[]> {
    const rows = await this.results.find({
      where: { examinationId },
      relations: { student: { user: true } },
      order: { rank: 'ASC' },
      withDeleted: true,
    });
    const examSubjectById = new Map(approved.map((row) => [row.id, row]));
    const marksByStudent = this.groupByStudent(marks);

    return rows
      .map((row) => ({
        rank: row.rank,
        studentId: row.studentId,
        studentName: row.student.user.fullName,
        studentCode: row.student.studentId,
        totalScore: row.totalScore,
        totalMax: row.totalMax,
        percentage: row.percentage,
        grade: row.grade,
        gradeRemark: row.gradeRemark,
        isPassing: row.isPassing,
        subjectsCount: row.subjectsCount,
        subjects: this.sortedSubjects(
          (marksByStudent.get(row.studentId) ?? []).map((mark) =>
            this.subjectView(
              examSubjectById.get(mark.examinationSubjectId)! as ExaminationSubject & { subject: { id: string; name: string } },
              mark.score,
              mark.isAbsent,
              mark.grade,
            ),
          ),
        ),
      }))
      .sort((a, b) => a.rank - b.rank || a.studentName.localeCompare(b.studentName));
  }

  private groupByStudent(marks: MarkWithStudent[]): Map<string, MarkWithStudent[]> {
    const grouped = new Map<string, MarkWithStudent[]>();
    for (const mark of marks) {
      const list = grouped.get(mark.studentId) ?? [];
      list.push(mark);
      grouped.set(mark.studentId, list);
    }
    return grouped;
  }

  private sortedSubjects(subjects: ResultSubjectView[]): ResultSubjectView[] {
    return subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }

  private async classSizes(examinationIds: string[]): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    if (examinationIds.length === 0) return sizes;
    const rows = await this.results
      .createQueryBuilder('result')
      .select('result.examinationId', 'id')
      .addSelect('COUNT(*)', 'count')
      .where('result.examinationId IN (:...ids)', { ids: examinationIds })
      .groupBy('result.examinationId')
      .getRawMany<{ id: string; count: string }>();
    for (const row of rows) sizes.set(row.id, parseInt(row.count, 10));
    return sizes;
  }

  private toSummary(row: Result, classSize: number): MyResultSummary {
    return {
      examinationId: row.examinationId,
      examinationName: row.examination.name,
      examinationType: row.examination.type,
      examDate: row.examination.examDate,
      academicPeriod: row.examination.academicPeriod,
      totalScore: row.totalScore,
      totalMax: row.totalMax,
      percentage: row.percentage,
      grade: row.grade,
      gradeRemark: row.gradeRemark,
      isPassing: row.isPassing,
      rank: row.rank,
      classSize,
      subjectsCount: row.subjectsCount,
      publishedAt: row.publishedAt,
    };
  }
}
