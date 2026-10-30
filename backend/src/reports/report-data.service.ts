import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from '../assignments/assignments.entity';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Examination } from '../examinations/examinations.entity';
import { GradingService } from '../grading/grading.service';
import { Mark } from '../marks/marks.entity';
import { Result } from '../results/results.entity';
import { ResultsService } from '../results/results.service';
import { percentageOf, toCents } from '../results/standings';
import { SettingsService } from '../settings/settings.service';
import { Student } from '../students/students.entity';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { SubmissionsService } from '../submissions/submissions.service';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { average, classStats, rankDescending } from './report-math';
import { ReportCell, ReportDocument, ReportSection } from './types/report.types.interface';

const ABSENT_NOTE = 'Absent students count as 0 in totals and averages.';
const PUBLISHED_NOTE = 'Only published results are used, exactly as students see them.';

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, ' ');
const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';
const yes = (value: boolean | null): string | null => (value === null ? null : value ? 'Pass' : 'Fail');
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/** Builds report documents from real data. Formatting (JSON/CSV/PDF) happens elsewhere. */
@Injectable()
export class ReportDataService {
  constructor(
    @InjectRepository(Result) private readonly results: Repository<Result>,
    @InjectRepository(Examination) private readonly exams: Repository<Examination>,
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly resultsService: ResultsService,
    private readonly submissionsService: SubmissionsService,
    private readonly grading: GradingService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Examination results (Class Master)

  async examinationResults(examinationId: string): Promise<ReportDocument> {
    const exam = await this.exams.findOne({ where: { id: examinationId } });
    if (!exam) throw new NotFoundException('Examination not found.');
    const standings = await this.resultsService.getStandings(examinationId);
    if (!standings.published) {
      throw new ConflictException('Reports use published results. Publish the results of this examination first.');
    }

    const subjectColumns = new Map<string, string>();
    for (const row of standings.rows) {
      for (const subject of row.subjects) subjectColumns.set(subject.subjectId, subject.subjectName);
    }
    const orderedSubjects = [...subjectColumns].sort((a, b) => a[1].localeCompare(b[1]));

    const rows = standings.rows.map((row) => {
      const cells: Record<string, ReportCell> = { rank: row.rank, code: row.studentCode, name: row.studentName };
      for (const [subjectId] of orderedSubjects) {
        const subject = row.subjects.find((entry) => entry.subjectId === subjectId);
        cells[`s_${subjectId}`] = !subject ? null : subject.isAbsent ? 'ABS' : subject.score === null ? null : `${subject.score}/${subject.maxMarks}`;
      }
      Object.assign(cells, {
        total: row.totalScore,
        max: row.totalMax,
        percentage: row.percentage,
        grade: row.grade,
        remark: row.gradeRemark,
        result: yes(row.isPassing),
      });
      return cells;
    });

    const stats = classStats(standings.rows);
    return {
      ...(await this.skeleton(`Examination results: ${exam.name}`, `${titleCase(exam.type)} | ${exam.examDate}`, `examination-results-${slug(exam.name)}`)),
      summary: [
        { label: 'Examination', value: exam.name },
        { label: 'Type', value: titleCase(exam.type) },
        { label: 'Exam date', value: exam.examDate },
        { label: 'Academic period', value: exam.academicPeriod },
        { label: 'Results published', value: exam.resultsPublishedAt ? dateOnly(exam.resultsPublishedAt) : null },
        { label: 'Students ranked', value: stats.count },
        { label: 'Class average (%)', value: stats.average },
        { label: 'Highest (%)', value: stats.highest },
        { label: 'Lowest (%)', value: stats.lowest },
        { label: 'Pass rate (%)', value: stats.passRate },
      ],
      sections: [
        {
          heading: 'Class ranking',
          columns: [
            { key: 'rank', label: 'Rank', align: 'center' },
            { key: 'code', label: 'Student ID' },
            { key: 'name', label: 'Name' },
            ...orderedSubjects.map(([id, name]) => ({ key: `s_${id}`, label: name, align: 'center' as const })),
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'max', label: 'Out of', align: 'right' },
            { key: 'percentage', label: '%', align: 'right' },
            { key: 'grade', label: 'Grade', align: 'center' },
            { key: 'remark', label: 'Remark' },
            { key: 'result', label: 'Result', align: 'center' },
          ],
          rows,
          emptyMessage: 'No students have a published result in this examination.',
        },
      ],
      notes: [PUBLISHED_NOTE, ABSENT_NOTE, 'Equal results share a rank and the next rank is skipped (1, 2, 2, 4).'],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // One student across all published examinations

  async studentPerformance(studentId: string): Promise<ReportDocument> {
    const student = await this.students.findOne({ where: { id: studentId }, relations: { user: true }, withDeleted: true });
    if (!student) throw new NotFoundException('Student not found.');

    const results = await this.results
      .createQueryBuilder('result')
      .innerJoinAndSelect('result.examination', 'exam')
      .where('result.studentId = :studentId', { studentId })
      .andWhere('exam.resultsPublishedAt IS NOT NULL')
      .orderBy('exam.examDate', 'ASC')
      .addOrderBy('exam.name', 'ASC')
      .getMany();
    const sizes = await this.classSizes(results.map((row) => row.examinationId));

    const marks = await this.marks
      .createQueryBuilder('mark')
      .innerJoinAndSelect('mark.examinationSubject', 'es')
      .innerJoinAndSelect('es.examination', 'exam')
      .innerJoinAndSelect('es.subject', 'subject')
      .where('mark.studentId = :studentId', { studentId })
      .andWhere('exam.resultsPublishedAt IS NOT NULL')
      .orderBy('exam.examDate', 'ASC')
      .addOrderBy('exam.name', 'ASC')
      .getMany();

    const bySubject = new Map<string, { name: string; percentages: number[]; lastGrade: string | null }>();
    for (const mark of marks) {
      const entry = bySubject.get(mark.examinationSubject.subjectId) ?? { name: mark.examinationSubject.subject.name, percentages: [], lastGrade: null };
      entry.percentages.push(percentageOf(toCents(mark.score ?? 0), toCents(mark.examinationSubject.maxMarks)));
      entry.lastGrade = mark.grade;
      bySubject.set(mark.examinationSubject.subjectId, entry);
    }

    const percentages = results.map((row) => row.percentage);
    return {
      ...(await this.skeleton(`Student performance: ${student.user.fullName}`, `Student ID ${student.studentId}`, `student-performance-${slug(student.user.fullName)}`)),
      summary: [
        { label: 'Student', value: student.user.fullName },
        { label: 'Student ID', value: student.studentId },
        { label: 'Examinations', value: results.length },
        { label: 'Average (%)', value: average(percentages) },
        { label: 'Best (%)', value: percentages.length ? Math.max(...percentages) : null },
        { label: 'Lowest (%)', value: percentages.length ? Math.min(...percentages) : null },
      ],
      sections: [
        {
          heading: 'Examinations',
          columns: [
            { key: 'exam', label: 'Examination' },
            { key: 'type', label: 'Type' },
            { key: 'date', label: 'Date' },
            { key: 'period', label: 'Period' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'max', label: 'Out of', align: 'right' },
            { key: 'percentage', label: '%', align: 'right' },
            { key: 'grade', label: 'Grade', align: 'center' },
            { key: 'rank', label: 'Rank', align: 'center' },
            { key: 'size', label: 'Class size', align: 'right' },
            { key: 'result', label: 'Result', align: 'center' },
          ],
          rows: results.map((row) => ({
            exam: row.examination.name,
            type: titleCase(row.examination.type),
            date: row.examination.examDate,
            period: row.examination.academicPeriod,
            total: row.totalScore,
            max: row.totalMax,
            percentage: row.percentage,
            grade: row.grade,
            rank: row.rank,
            size: sizes.get(row.examinationId) ?? null,
            result: yes(row.isPassing),
          })),
          emptyMessage: 'No published examination results for this student yet.',
        },
        {
          heading: 'By subject',
          columns: [
            { key: 'subject', label: 'Subject' },
            { key: 'exams', label: 'Examinations', align: 'right' },
            { key: 'average', label: 'Average (%)', align: 'right' },
            { key: 'best', label: 'Best (%)', align: 'right' },
            { key: 'lowest', label: 'Lowest (%)', align: 'right' },
            { key: 'grade', label: 'Latest grade', align: 'center' },
          ],
          rows: [...bySubject.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entry) => ({
              subject: entry.name,
              exams: entry.percentages.length,
              average: average(entry.percentages),
              best: Math.max(...entry.percentages),
              lowest: Math.min(...entry.percentages),
              grade: entry.lastGrade,
            })),
          emptyMessage: 'No subject marks have been published for this student yet.',
        },
      ],
      notes: [PUBLISHED_NOTE, ABSENT_NOTE],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // One subject (Class Master, or a teacher of that subject)

  async subjectPerformance(subjectId: string, examinationId: string | undefined, actor: AuthenticatedUser): Promise<ReportDocument> {
    const subject = await this.subjects.findOne({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found.');
    if (actor.role === Role.TEACHER) {
      const teaches = await this.teacherSubjects.exists({ where: { teacherId: actor.teacherProfileId ?? '', subjectId } });
      if (!teaches) throw new ForbiddenException('You are not assigned to this subject.');
    }

    const qb = this.marks
      .createQueryBuilder('mark')
      .withDeleted()
      .innerJoinAndSelect('mark.examinationSubject', 'es')
      .innerJoinAndSelect('es.examination', 'exam')
      .innerJoinAndSelect('mark.student', 'student')
      .innerJoinAndSelect('student.user', 'user')
      .where('es.subjectId = :subjectId', { subjectId })
      .andWhere('exam.resultsPublishedAt IS NOT NULL')
      .orderBy('exam.examDate', 'ASC')
      .addOrderBy('exam.name', 'ASC');
    if (examinationId) qb.andWhere('es.examinationId = :examinationId', { examinationId });
    const marks = await qb.getMany();
    if (examinationId && marks.length === 0) {
      const exam = await this.exams.findOne({ where: { id: examinationId } });
      if (!exam) throw new NotFoundException('Examination not found.');
    }

    const percentageOfMark = (mark: Mark): number => percentageOf(toCents(mark.score ?? 0), toCents(mark.examinationSubject.maxMarks));

    const byExam = new Map<string, Mark[]>();
    for (const mark of marks) {
      const list = byExam.get(mark.examinationSubject.examinationId) ?? [];
      list.push(mark);
      byExam.set(mark.examinationSubject.examinationId, list);
    }

    const examRows = [...byExam.values()].map((list) => {
      const exam = list[0].examinationSubject.examination;
      const percentages = list.map(percentageOfMark);
      return {
        exam: exam.name,
        date: exam.examDate,
        max: list[0].examinationSubject.maxMarks,
        students: list.length,
        absent: list.filter((mark) => mark.isAbsent).length,
        average: average(percentages),
        highest: Math.max(...percentages),
        lowest: Math.min(...percentages),
      };
    });

    const bands = await this.grading.loadActiveBands();
    const bandOrder = new Map(bands.map((band) => [band.grade, band.minMark]));
    const distribution = new Map<string, number>();
    for (const mark of marks) {
      if (mark.grade) distribution.set(mark.grade, (distribution.get(mark.grade) ?? 0) + 1);
    }

    const sections: ReportSection[] = [
      {
        heading: 'By examination',
        columns: [
          { key: 'exam', label: 'Examination' },
          { key: 'date', label: 'Date' },
          { key: 'max', label: 'Max marks', align: 'right' },
          { key: 'students', label: 'Students', align: 'right' },
          { key: 'absent', label: 'Absent', align: 'right' },
          { key: 'average', label: 'Average (%)', align: 'right' },
          { key: 'highest', label: 'Highest (%)', align: 'right' },
          { key: 'lowest', label: 'Lowest (%)', align: 'right' },
        ],
        rows: examRows,
        emptyMessage: 'No published results include this subject yet.',
      },
      {
        heading: 'Grade distribution',
        columns: [
          { key: 'grade', label: 'Grade', align: 'center' },
          { key: 'count', label: 'Students', align: 'right' },
        ],
        rows: [...distribution]
          .sort((a, b) => (bandOrder.get(b[0]) ?? -1) - (bandOrder.get(a[0]) ?? -1) || a[0].localeCompare(b[0]))
          .map(([grade, count]) => ({ grade, count })),
        emptyMessage: 'No grades have been published for this subject yet.',
      },
    ];

    if (examinationId) {
      const ranked = rankDescending(marks, percentageOfMark, (a, b) => a.student.user.fullName.localeCompare(b.student.user.fullName));
      sections.push({
        heading: 'Student scores',
        columns: [
          { key: 'rank', label: 'Rank', align: 'center' },
          { key: 'code', label: 'Student ID' },
          { key: 'name', label: 'Name' },
          { key: 'score', label: 'Score', align: 'right' },
          { key: 'max', label: 'Out of', align: 'right' },
          { key: 'percentage', label: '%', align: 'right' },
          { key: 'grade', label: 'Grade', align: 'center' },
        ],
        rows: ranked.map(({ item, rank }) => ({
          rank,
          code: item.student.studentId,
          name: item.student.user.fullName,
          score: item.isAbsent ? 'ABS' : item.score,
          max: item.examinationSubject.maxMarks,
          percentage: percentageOfMark(item),
          grade: item.grade,
        })),
        emptyMessage: 'No scores to show for this examination.',
      });
    }

    const allPercentages = marks.map(percentageOfMark);
    return {
      ...(await this.skeleton(`Subject performance: ${subject.name}`, null, `subject-performance-${slug(subject.name)}`)),
      summary: [
        { label: 'Subject', value: subject.name },
        { label: 'Examinations', value: examRows.length },
        { label: 'Marks recorded', value: marks.length },
        { label: 'Average (%)', value: average(allPercentages) },
        { label: 'Highest (%)', value: allPercentages.length ? Math.max(...allPercentages) : null },
        { label: 'Lowest (%)', value: allPercentages.length ? Math.min(...allPercentages) : null },
      ],
      sections,
      notes: [PUBLISHED_NOTE, ABSENT_NOTE],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Whole class

  async classPerformance(academicPeriod: string | undefined): Promise<ReportDocument> {
    const results = await this.publishedResults(academicPeriod);
    const byExam = new Map<string, Result[]>();
    for (const result of results) {
      const list = byExam.get(result.examinationId) ?? [];
      list.push(result);
      byExam.set(result.examinationId, list);
    }

    const rows = [...byExam.values()].map((list) => {
      const exam = list[0].examination;
      const stats = classStats(list);
      const top = list.filter((entry) => entry.rank === 1).map((entry) => entry.student.user.fullName);
      return {
        exam: exam.name,
        type: titleCase(exam.type),
        date: exam.examDate,
        period: exam.academicPeriod,
        students: stats.count,
        average: stats.average,
        highest: stats.highest,
        lowest: stats.lowest,
        passRate: stats.passRate,
        top: top.join(', '),
      };
    });

    const allStats = classStats(results);
    return {
      ...(await this.skeleton('Class performance', academicPeriod ? `Academic period: ${academicPeriod}` : 'All published examinations', `class-performance${academicPeriod ? `-${slug(academicPeriod)}` : ''}`)),
      summary: [
        { label: 'Examinations', value: rows.length },
        { label: 'Average of all results (%)', value: allStats.average },
        { label: 'Highest (%)', value: allStats.highest },
        { label: 'Lowest (%)', value: allStats.lowest },
        { label: 'Pass rate (%)', value: allStats.passRate },
      ],
      sections: [
        {
          heading: 'By examination',
          columns: [
            { key: 'exam', label: 'Examination' },
            { key: 'type', label: 'Type' },
            { key: 'date', label: 'Date' },
            { key: 'period', label: 'Period' },
            { key: 'students', label: 'Students', align: 'right' },
            { key: 'average', label: 'Average (%)', align: 'right' },
            { key: 'highest', label: 'Highest (%)', align: 'right' },
            { key: 'lowest', label: 'Lowest (%)', align: 'right' },
            { key: 'passRate', label: 'Pass rate (%)', align: 'right' },
            { key: 'top', label: 'Top of the class' },
          ],
          rows,
          emptyMessage: 'No examination results have been published yet.',
        },
      ],
      notes: [PUBLISHED_NOTE, ABSENT_NOTE],
    };
  }

  /** Cumulative ranking: each student's average percentage over the published examinations. */
  async rankings(academicPeriod: string | undefined): Promise<ReportDocument> {
    const results = await this.publishedResults(academicPeriod);
    const byStudent = new Map<string, Result[]>();
    for (const result of results) {
      const list = byStudent.get(result.studentId) ?? [];
      list.push(result);
      byStudent.set(result.studentId, list);
    }

    const activeScale = await this.grading.loadActiveScale();
    const bands = activeScale?.bands ?? [];
    const entries = [...byStudent.values()].map((list) => {
      const percentages = list.map((entry) => entry.percentage);
      const mean = average(percentages) ?? 0;
      return {
        name: list[0].student.user.fullName,
        code: list[0].student.studentId,
        exams: list.length,
        average: mean,
        best: Math.max(...percentages),
        grade: activeScale ? this.grading.gradeAtPercentage(mean, activeScale.maxMark, bands).grade : null,
      };
    });
    const ranked = rankDescending(entries, (entry) => Math.round(entry.average * 100), (a, b) => a.name.localeCompare(b.name));

    return {
      ...(await this.skeleton('Class rankings', academicPeriod ? `Academic period: ${academicPeriod}` : 'All published examinations', `class-rankings${academicPeriod ? `-${slug(academicPeriod)}` : ''}`)),
      summary: [
        { label: 'Students ranked', value: ranked.length },
        { label: 'Examinations counted', value: new Set(results.map((result) => result.examinationId)).size },
        { label: 'Class average (%)', value: average(entries.map((entry) => entry.average)) },
      ],
      sections: [
        {
          heading: 'Ranking',
          columns: [
            { key: 'rank', label: 'Rank', align: 'center' },
            { key: 'code', label: 'Student ID' },
            { key: 'name', label: 'Name' },
            { key: 'exams', label: 'Examinations', align: 'right' },
            { key: 'average', label: 'Average (%)', align: 'right' },
            { key: 'best', label: 'Best (%)', align: 'right' },
            { key: 'grade', label: 'Grade of average', align: 'center' },
          ],
          rows: ranked.map(({ item, rank }) => ({ rank, ...item })),
          emptyMessage: 'No examination results have been published yet.',
        },
      ],
      notes: [
        PUBLISHED_NOTE,
        'The ranking uses each student\'s average of the percentages of the examinations they have a result in. Equal averages share a rank.',
        'The grade is looked up from the grading scale active now.',
      ],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Assignments (Class Master, or a teacher for their own subjects)

  async assignmentPerformance(assignmentId: string | undefined, subjectId: string | undefined, actor: AuthenticatedUser): Promise<ReportDocument> {
    const qb = this.assignments
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.subject', 'subject')
      .innerJoinAndSelect('assignment.teacher', 'teacher')
      .innerJoinAndSelect('teacher.user', 'teacherUser')
      .orderBy('assignment.dueAt', 'DESC')
      .addOrderBy('assignment.id', 'ASC');

    if (actor.role === Role.TEACHER) {
      qb.where(`EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = assignment.subject_id AND ts.teacher_id = :teacherId)`, {
        teacherId: actor.teacherProfileId,
      });
    } else {
      qb.where('1 = 1');
    }
    if (subjectId) qb.andWhere('assignment.subjectId = :subjectId', { subjectId });
    if (assignmentId) qb.andWhere('assignment.id = :assignmentId', { assignmentId });
    const assignments = await qb.getMany();

    if (assignmentId && assignments.length === 0) {
      throw new NotFoundException('Assignment not found.');
    }

    const classSize = await this.students.count();
    const stats = new Map<string, { submitted: number; graded: number; late: number; percentages: number[] }>();
    if (assignments.length > 0) {
      const submissions = await this.submissions
        .createQueryBuilder('submission')
        .innerJoinAndSelect('submission.student', 'student')
        .where('submission.assignmentId IN (:...ids)', { ids: assignments.map((assignment) => assignment.id) })
        .getMany();
      const maxById = new Map(assignments.map((assignment) => [assignment.id, assignment.maxMarks]));
      for (const submission of submissions) {
        const entry = stats.get(submission.assignmentId) ?? { submitted: 0, graded: 0, late: 0, percentages: [] };
        entry.submitted += 1;
        if (submission.isLate) entry.late += 1;
        if (submission.score !== null) {
          entry.graded += 1;
          entry.percentages.push(percentageOf(toCents(submission.score), toCents(maxById.get(submission.assignmentId)!)));
        }
        stats.set(submission.assignmentId, entry);
      }
    }

    const rows = assignments.map((assignment) => {
      const entry = stats.get(assignment.id) ?? { submitted: 0, graded: 0, late: 0, percentages: [] };
      return {
        title: assignment.title,
        subject: assignment.subject.name,
        teacher: assignment.teacher.user.fullName,
        due: dateOnly(assignment.dueAt),
        max: assignment.maxMarks,
        submitted: entry.submitted,
        graded: entry.graded,
        late: entry.late,
        missing: Math.max(classSize - entry.submitted, 0),
        average: average(entry.percentages),
      };
    });

    const sections: ReportSection[] = [
      {
        heading: 'Assignments',
        columns: [
          { key: 'title', label: 'Assignment' },
          { key: 'subject', label: 'Subject' },
          { key: 'teacher', label: 'Teacher' },
          { key: 'due', label: 'Due', align: 'center' },
          { key: 'max', label: 'Max marks', align: 'right' },
          { key: 'submitted', label: 'Submitted', align: 'right' },
          { key: 'graded', label: 'Graded', align: 'right' },
          { key: 'late', label: 'Late', align: 'right' },
          { key: 'missing', label: 'Missing', align: 'right' },
          { key: 'average', label: 'Average (%)', align: 'right' },
        ],
        rows,
        emptyMessage: 'No assignments to report on.',
      },
    ];

    if (assignmentId) {
      const overview = await this.submissionsService.overview(assignmentId, actor);
      sections.push({
        heading: 'Students',
        columns: [
          { key: 'code', label: 'Student ID' },
          { key: 'name', label: 'Name' },
          { key: 'status', label: 'Status', align: 'center' },
          { key: 'submittedAt', label: 'Submitted', align: 'center' },
          { key: 'late', label: 'Late', align: 'center' },
          { key: 'score', label: 'Score', align: 'right' },
        ],
        rows: overview.rows.map((row) => ({
          code: row.studentCode,
          name: row.studentName,
          status: titleCase(row.status),
          submittedAt: row.submittedAt ? row.submittedAt.toISOString().slice(0, 16).replace('T', ' ') : null,
          late: row.status === 'NOT_SUBMITTED' ? null : row.isLate ? 'Yes' : 'No',
          score: row.score,
        })),
        emptyMessage: 'There are no students in the class yet.',
      });
    }

    const totals = rows.reduce(
      (sum, row) => ({ submitted: sum.submitted + row.submitted, graded: sum.graded + row.graded, late: sum.late + row.late }),
      { submitted: 0, graded: 0, late: 0 },
    );
    return {
      ...(await this.skeleton('Assignment performance', actor.role === Role.TEACHER ? 'Your subjects' : null, 'assignment-performance')),
      summary: [
        { label: 'Assignments', value: rows.length },
        { label: 'Students in class', value: classSize },
        { label: 'Submissions', value: totals.submitted },
        { label: 'Graded', value: totals.graded },
        { label: 'Late', value: totals.late },
      ],
      sections,
      notes: ['"Missing" is the current class size minus the students who submitted. Scores include grades not yet released to students.'],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Teacher-subject assignments (Class Master)

  async teacherSubjectAssignments(): Promise<ReportDocument> {
    const links = await this.teacherSubjects
      .createQueryBuilder('link')
      .innerJoinAndSelect('link.teacher', 'teacher')
      .innerJoinAndSelect('teacher.user', 'user')
      .innerJoinAndSelect('link.subject', 'subject')
      .orderBy('user.fullName', 'ASC')
      .addOrderBy('subject.name', 'ASC')
      .getMany();
    const subjects = await this.subjects.find({ order: { name: 'ASC' } });
    const covered = new Set(links.map((link) => link.subjectId));
    const unassigned = subjects.filter((subject) => !covered.has(subject.id));

    return {
      ...(await this.skeleton('Teacher and subject assignments', null, 'teacher-subject-assignments')),
      summary: [
        { label: 'Subjects', value: subjects.length },
        { label: 'Teachers with subjects', value: new Set(links.map((link) => link.teacherId)).size },
        { label: 'Assignments', value: links.length },
        { label: 'Subjects without a teacher', value: unassigned.length },
      ],
      sections: [
        {
          heading: 'Who teaches what',
          columns: [
            { key: 'teacher', label: 'Teacher' },
            { key: 'username', label: 'Username' },
            { key: 'status', label: 'Account status', align: 'center' },
            { key: 'subject', label: 'Subject' },
          ],
          rows: links.map((link) => ({
            teacher: link.teacher.user.fullName,
            username: link.teacher.user.username,
            status: titleCase(link.teacher.user.status),
            subject: link.subject.name,
          })),
          emptyMessage: 'No teacher has been assigned to a subject yet.',
        },
        {
          heading: 'Subjects without a teacher',
          columns: [
            { key: 'subject', label: 'Subject' },
            { key: 'active', label: 'Active', align: 'center' },
          ],
          rows: unassigned.map((subject) => ({ subject: subject.name, active: subject.isActive ? 'Yes' : 'No' })),
          emptyMessage: 'Every subject has a teacher.',
        },
      ],
      notes: [],
    };
  }

  // ---------------------------------------------------------------------------------------------

  private async skeleton(title: string, subtitle: string | null, fileStem: string): Promise<Omit<ReportDocument, 'summary' | 'sections' | 'notes'>> {
    return { title, subtitle, className: await this.settings.getClassName(), generatedAt: new Date(), fileStem };
  }

  /** Frozen results of published examinations (removed students stay: this is the published record). */
  private publishedResults(academicPeriod: string | undefined): Promise<Result[]> {
    const qb = this.results
      .createQueryBuilder('result')
      .withDeleted()
      .innerJoinAndSelect('result.examination', 'exam')
      .innerJoinAndSelect('result.student', 'student')
      .innerJoinAndSelect('student.user', 'user')
      .where('exam.resultsPublishedAt IS NOT NULL')
      .orderBy('exam.examDate', 'ASC')
      .addOrderBy('exam.name', 'ASC')
      .addOrderBy('result.rank', 'ASC')
      .addOrderBy('result.id', 'ASC');
    if (academicPeriod) qb.andWhere('exam.academicPeriod = :academicPeriod', { academicPeriod });
    return qb.getMany();
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
}
