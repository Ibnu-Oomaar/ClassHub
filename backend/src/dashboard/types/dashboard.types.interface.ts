import { Role } from '../../common/enums/role.enum';
import { AnnouncementAudience } from '../../announcements/types/announcement.types.interface';
import { MarksStatus } from '../../examinations/types/examination.types.interface';
import { MyResultSummary } from '../../results/types/result.types.interface';

export interface DashboardExamItem {
  id: string;
  name: string;
  type: string;
  examDate: string;
  academicPeriod: string | null;
}

export interface DashboardAnnouncementItem {
  id: string;
  title: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  publishedAt: Date | null;
}

/** Everything is counted from the database. With no data, every number is simply 0 and every list is empty. */
export interface ClassMasterDashboard {
  role: Role.CLASS_MASTER;
  className: string;
  people: {
    students: { total: number; active: number };
    teachers: { total: number; active: number };
    subjects: { total: number; active: number; withoutTeacher: number };
  };
  examinations: {
    upcoming: number;
    /** Mark sheets the teachers submitted and that wait for approval. */
    awaitingReview: number;
    /** Every subject approved, results not yet published. */
    readyToPublish: number;
    published: number;
  };
  assignments: { open: number };
  upcomingExaminations: DashboardExamItem[];
  latestResults: { examinationId: string; name: string; students: number; average: number | null; passRate: number | null }[];
  recentActivity: { id: string; createdAt: Date; actorName: string; action: string; summary: string }[];
  /** Null when no backup has ever been made: the dashboard then reminds the Class Master to make one. */
  lastBackupAt: Date | null;
  announcements: DashboardAnnouncementItem[];
}

export interface TeacherDashboard {
  role: Role.TEACHER;
  className: string;
  subjects: { id: string; name: string }[];
  marks: {
    /** Sheets still to fill in (not started or saved as draft). */
    toEnter: number;
    rejected: number;
    awaitingReview: number;
    approved: number;
  };
  marksToDo: { examinationSubjectId: string; examinationName: string; examDate: string; subjectName: string; marksStatus: MarksStatus }[];
  assignments: { open: number; submissionsToGrade: number };
  assignmentsToGrade: { assignmentId: string; title: string; subjectName: string; dueAt: Date; ungraded: number }[];
  upcomingExaminations: DashboardExamItem[];
  announcements: DashboardAnnouncementItem[];
}

export interface StudentDashboard {
  role: Role.STUDENT;
  className: string;
  results: { published: number; averagePercentage: number | null; latest: MyResultSummary | null };
  assignments: { toDo: number; overdue: number; submissionsEnabled: boolean };
  assignmentsToDo: { id: string; title: string; subjectName: string; dueAt: Date; maxMarks: number; state: 'OPEN' | 'OVERDUE' }[];
  recentGrades: { submissionId: string; assignmentTitle: string; subjectName: string; score: number; maxMarks: number; gradedAt: Date | null }[];
  upcomingExaminations: DashboardExamItem[];
  announcements: DashboardAnnouncementItem[];
}

export type DashboardView = ClassMasterDashboard | TeacherDashboard | StudentDashboard;
