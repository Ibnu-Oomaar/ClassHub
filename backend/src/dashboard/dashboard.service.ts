import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AnnouncementQueryDto } from '../announcements/dto/announcement-query.dto';
import { Assignment } from '../assignments/assignments.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditLogQueryDto } from '../audit-logs/dto/audit-log-query.dto';
import { Backup } from '../backups/backups.entity';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Examination, ExaminationSubject } from '../examinations/examinations.entity';
import { ExaminationStatus, MARKS_ENTRY_EXAM_STATUSES, MarksStatus } from '../examinations/types/examination.types.interface';
import { average, classStats } from '../reports/report-math';
import { Result } from '../results/results.entity';
import { ResultsService } from '../results/results.service';
import { SettingsService } from '../settings/settings.service';
import { Student } from '../students/students.entity';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { Teacher } from '../teachers/teachers.entity';
import {
  ClassMasterDashboard,
  DashboardAnnouncementItem,
  DashboardExamItem,
  DashboardView,
  StudentDashboard,
  TeacherDashboard,
} from './types/dashboard.types.interface';

const LIST_SIZE = 5;
const NO_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(TeacherSubject) private readonly teacherSubjects: Repository<TeacherSubject>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(Examination) private readonly exams: Repository<Examination>,
    @InjectRepository(ExaminationSubject) private readonly examSubjects: Repository<ExaminationSubject>,
    @InjectRepository(Result) private readonly results: Repository<Result>,
    @InjectRepository(Backup) private readonly backups: Repository<Backup>,
    private readonly resultsService: ResultsService,
    private readonly announcementsService: AnnouncementsService,
    private readonly auditLogs: AuditLogsService,
    private readonly settings: SettingsService,
  ) {}

  get(actor: AuthenticatedUser): Promise<DashboardView> {
    switch (actor.role) {
      case Role.CLASS_MASTER:
        return this.classMaster(actor);
      case Role.TEACHER:
        return this.teacher(actor);
      case Role.STUDENT:
        return this.student(actor);
      default:
        throw new ForbiddenException();
    }
  }

  // ---------------------------------------------------------------------------------------------

  private async classMaster(actor: AuthenticatedUser): Promise<ClassMasterDashboard> {
    const entryStatuses = [...MARKS_ENTRY_EXAM_STATUSES];

    const [
      className,
      studentTotal,
      studentActive,
      teacherTotal,
      teacherActive,
      subjectTotal,
      subjectActive,
      subjectsWithoutTeacher,
      upcoming,
      awaitingReview,
      readyToPublish,
      published,
      openAssignments,
      upcomingExaminations,
      latestResults,
      activity,
      latestBackup,
      announcements,
    ] = await Promise.all([
      this.settings.getClassName(),
      this.students.count(),
      this.students.createQueryBuilder('s').innerJoin('s.user', 'u').where('u.status = :status', { status: AccountStatus.ACTIVE }).getCount(),
      this.teachers.count(),
      this.teachers.createQueryBuilder('t').innerJoin('t.user', 'u').where('u.status = :status', { status: AccountStatus.ACTIVE }).getCount(),
      this.subjects.count(),
      this.subjects.count({ where: { isActive: true } }),
      this.subjects
        .createQueryBuilder('s')
        .where('s.isActive = true')
        .andWhere('NOT EXISTS (SELECT 1 FROM teacher_subjects ts WHERE ts.subject_id = s.id)')
        .getCount(),
      this.upcomingExamQuery().getCount(),
      this.examSubjects
        .createQueryBuilder('es')
        .innerJoin('es.examination', 'e')
        .where('es.marksStatus = :submitted', { submitted: MarksStatus.SUBMITTED })
        .andWhere('e.status IN (:...entryStatuses)', { entryStatuses })
        .getCount(),
      this.exams
        .createQueryBuilder('e')
        .where('e.resultsPublishedAt IS NULL')
        .andWhere('e.status IN (:...entryStatuses)', { entryStatuses })
        .andWhere('EXISTS (SELECT 1 FROM examination_subjects es WHERE es.examination_id = e.id)')
        .andWhere(`NOT EXISTS (SELECT 1 FROM examination_subjects es WHERE es.examination_id = e.id AND es.marks_status <> :approved)`, {
          approved: MarksStatus.APPROVED,
        })
        .getCount(),
      this.exams.createQueryBuilder('e').where('e.resultsPublishedAt IS NOT NULL').getCount(),
      this.assignments.createQueryBuilder('a').where('a.isAvailable = true').andWhere('a.dueAt > now()').getCount(),
      this.upcomingExamQuery().orderBy('e.examDate', 'ASC').addOrderBy('e.name', 'ASC').take(LIST_SIZE).getMany(),
      this.latestResults(),
      this.auditLogs.findAll(Object.assign(new AuditLogQueryDto(), { page: 1, limit: 8 })),
      this.backups.createQueryBuilder('b').select('MAX(b.createdAt)', 'latest').getRawOne<{ latest: Date | null }>(),
      this.announcementItems(actor),
    ]);

    return {
      role: Role.CLASS_MASTER,
      className,
      people: {
        students: { total: studentTotal, active: studentActive },
        teachers: { total: teacherTotal, active: teacherActive },
        subjects: { total: subjectTotal, active: subjectActive, withoutTeacher: subjectsWithoutTeacher },
      },
      examinations: { upcoming, awaitingReview, readyToPublish, published },
      assignments: { open: openAssignments },
      upcomingExaminations: upcomingExaminations.map((exam) => this.examItem(exam)),
      latestResults,
      recentActivity: activity.items.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        actorName: row.actorName,
        action: row.action,
        summary: row.summary,
      })),
      lastBackupAt: latestBackup?.latest ? new Date(latestBackup.latest) : null,
      announcements,
    };
  }

  private async teacher(actor: AuthenticatedUser): Promise<TeacherDashboard> {
    const teacherId = actor.teacherProfileId ?? NO_ID;
    const links = await this.teacherSubjects.find({ where: { teacherId }, relations: { subject: true } });
    const subjectIds = links.map((link) => link.subjectId);
    const idsOrNone = subjectIds.length > 0 ? subjectIds : [NO_ID];
    const entryStatuses = [...MARKS_ENTRY_EXAM_STATUSES];

    const sheets = () =>
      this.examSubjects
        .createQueryBuilder('es')
        .innerJoinAndSelect('es.examination', 'e')
        .innerJoinAndSelect('es.subject', 'subject')
        .where('es.subjectId IN (:...subjectIds)', { subjectIds: idsOrNone })
        .andWhere('e.status IN (:...entryStatuses)', { entryStatuses });

    const [className, sheetRows, openAssignments, ungradedTotal, ungradedByAssignment, upcomingExaminations, announcements] = await Promise.all([
      this.settings.getClassName(),
      sheets().getMany(),
      this.assignments
        .createQueryBuilder('a')
        .where('a.subjectId IN (:...subjectIds)', { subjectIds: idsOrNone })
        .andWhere('a.dueAt > now()')
        .getCount(),
      this.ungradedSubmissions(idsOrNone).getCount(),
      this.ungradedSubmissions(idsOrNone)
        .select('a.id', 'assignmentId')
        .addSelect('a.title', 'title')
        .addSelect('subject.name', 'subjectName')
        .addSelect('a.dueAt', 'dueAt')
        .addSelect('COUNT(*)', 'ungraded')
        .groupBy('a.id')
        .addGroupBy('a.title')
        .addGroupBy('subject.name')
        .addGroupBy('a.dueAt')
        .orderBy('a.dueAt', 'ASC')
        .limit(LIST_SIZE)
        .getRawMany<{ assignmentId: string; title: string; subjectName: string; dueAt: Date; ungraded: string }>(),
      this.upcomingExamQuery()
        .andWhere('EXISTS (SELECT 1 FROM examination_subjects es WHERE es.examination_id = e.id AND es.subject_id IN (:...subjectIds))', { subjectIds: idsOrNone })
        .orderBy('e.examDate', 'ASC')
        .addOrderBy('e.name', 'ASC')
        .take(LIST_SIZE)
        .getMany(),
      this.announcementItems(actor),
    ]);

    const editable = [MarksStatus.PENDING, MarksStatus.DRAFT, MarksStatus.REJECTED];
    const todo = sheetRows
      .filter((row) => editable.includes(row.marksStatus) && row.examination.resultsPublishedAt === null)
      .sort((a, b) => a.examination.examDate.localeCompare(b.examination.examDate) || a.subject.name.localeCompare(b.subject.name));
    const count = (status: MarksStatus[]): number => sheetRows.filter((row) => status.includes(row.marksStatus)).length;

    return {
      role: Role.TEACHER,
      className,
      subjects: links.map((link) => ({ id: link.subjectId, name: link.subject.name })).sort((a, b) => a.name.localeCompare(b.name)),
      marks: {
        toEnter: count([MarksStatus.PENDING, MarksStatus.DRAFT]),
        rejected: count([MarksStatus.REJECTED]),
        awaitingReview: count([MarksStatus.SUBMITTED]),
        approved: count([MarksStatus.APPROVED]),
      },
      marksToDo: todo.slice(0, LIST_SIZE).map((row) => ({
        examinationSubjectId: row.id,
        examinationName: row.examination.name,
        examDate: row.examination.examDate,
        subjectName: row.subject.name,
        marksStatus: row.marksStatus,
      })),
      assignments: { open: openAssignments, submissionsToGrade: ungradedTotal },
      assignmentsToGrade: ungradedByAssignment.map((row) => ({
        assignmentId: row.assignmentId,
        title: row.title,
        subjectName: row.subjectName,
        dueAt: new Date(row.dueAt),
        ungraded: parseInt(row.ungraded, 10),
      })),
      upcomingExaminations: upcomingExaminations.map((exam) => this.examItem(exam)),
      announcements,
    };
  }

  private async student(actor: AuthenticatedUser): Promise<StudentDashboard> {
    const studentId = actor.studentProfileId ?? NO_ID;
    const todoQuery = () =>
      this.assignments
        .createQueryBuilder('a')
        .innerJoinAndSelect('a.subject', 'subject')
        .where('a.isAvailable = true')
        .andWhere('subject.isActive = true')
        .andWhere('(a.dueAt > now() OR a.allowLateSubmissions = true)')
        .andWhere('NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = :studentId)', { studentId });

    const [className, myResults, submissionsEnabled, todoCount, overdueCount, todoRows, graded, upcomingExaminations, announcements] = await Promise.all([
      this.settings.getClassName(),
      this.resultsService.myResults(actor),
      this.settings.areSubmissionsEnabled(),
      todoQuery().getCount(),
      todoQuery().andWhere('a.dueAt <= now()').getCount(),
      todoQuery().orderBy('a.dueAt', 'ASC').addOrderBy('a.id', 'ASC').take(LIST_SIZE).getMany(),
      this.submissions
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.assignment', 'a')
        .innerJoinAndSelect('a.subject', 'subject')
        .where('s.studentId = :studentId', { studentId })
        .andWhere('s.isReleased = true')
        .andWhere('s.score IS NOT NULL')
        .orderBy('s.gradedAt', 'DESC')
        .take(3)
        .getMany(),
      this.upcomingExamQuery().orderBy('e.examDate', 'ASC').addOrderBy('e.name', 'ASC').take(LIST_SIZE).getMany(),
      this.announcementItems(actor),
    ]);

    const now = Date.now();
    return {
      role: Role.STUDENT,
      className,
      results: {
        published: myResults.length,
        averagePercentage: average(myResults.map((result) => result.percentage)),
        latest: myResults[0] ?? null,
      },
      assignments: { toDo: todoCount, overdue: overdueCount, submissionsEnabled },
      assignmentsToDo: todoRows.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        subjectName: assignment.subject.name,
        dueAt: assignment.dueAt,
        maxMarks: assignment.maxMarks,
        state: assignment.dueAt.getTime() > now ? 'OPEN' : 'OVERDUE',
      })),
      recentGrades: graded.map((submission) => ({
        submissionId: submission.id,
        assignmentTitle: submission.assignment.title,
        subjectName: submission.assignment.subject.name,
        score: submission.score as number,
        maxMarks: submission.assignment.maxMarks,
        gradedAt: submission.gradedAt,
      })),
      upcomingExaminations: upcomingExaminations.map((exam) => this.examItem(exam)),
      announcements,
    };
  }

  // ---------------------------------------------------------------------------------------------

  /** Scheduled examinations from today on. Drafts are for the Class Master only and never counted here. */
  private upcomingExamQuery(): SelectQueryBuilder<Examination> {
    return this.exams
      .createQueryBuilder('e')
      .where('e.status = :scheduled', { scheduled: ExaminationStatus.SCHEDULED })
      .andWhere('e.examDate >= CURRENT_DATE');
  }

  /** Submitted work still waiting for a score, in the given subjects. */
  private ungradedSubmissions(subjectIds: string[]): SelectQueryBuilder<Submission> {
    return this.submissions
      .createQueryBuilder('s')
      .innerJoin('s.assignment', 'a')
      .innerJoin('a.subject', 'subject')
      .innerJoin('s.student', 'student')
      .where('a.subjectId IN (:...subjectIds)', { subjectIds })
      .andWhere('s.score IS NULL');
  }

  /** The last three published examinations with their class figures. */
  private async latestResults(): Promise<ClassMasterDashboard['latestResults']> {
    const exams = await this.exams
      .createQueryBuilder('e')
      .where('e.resultsPublishedAt IS NOT NULL')
      .orderBy('e.resultsPublishedAt', 'DESC')
      .take(3)
      .getMany();
    if (exams.length === 0) return [];

    const rows = await this.results
      .createQueryBuilder('r')
      .where('r.examinationId IN (:...ids)', { ids: exams.map((exam) => exam.id) })
      .getMany();
    return exams.map((exam) => {
      const stats = classStats(rows.filter((row) => row.examinationId === exam.id));
      return { examinationId: exam.id, name: exam.name, students: stats.count, average: stats.average, passRate: stats.passRate };
    });
  }

  private async announcementItems(actor: AuthenticatedUser): Promise<DashboardAnnouncementItem[]> {
    const page = await this.announcementsService.list(Object.assign(new AnnouncementQueryDto(), { page: 1, limit: 3 }), actor);
    return page.items.map((item) => ({
      id: item.id,
      title: item.title,
      audience: item.audience,
      isPinned: item.isPinned,
      publishedAt: item.publishedAt,
    }));
  }

  private examItem(exam: Examination): DashboardExamItem {
    return { id: exam.id, name: exam.name, type: exam.type, examDate: exam.examDate, academicPeriod: exam.academicPeriod };
  }
}
