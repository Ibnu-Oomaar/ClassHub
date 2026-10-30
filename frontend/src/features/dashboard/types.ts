import type { MyResultSummary } from '@/features/results/types';

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
  audience: 'ALL' | 'TEACHERS' | 'STUDENTS';
  isPinned: boolean;
  publishedAt: string | null;
}

export interface ClassMasterDashboard {
  role: 'CLASS_MASTER';
  className: string;
  people: {
    students: { total: number; active: number };
    teachers: { total: number; active: number };
    subjects: { total: number; active: number; withoutTeacher: number };
  };
  examinations: { upcoming: number; awaitingReview: number; readyToPublish: number; published: number };
  assignments: { open: number };
  upcomingExaminations: DashboardExamItem[];
  latestResults: { examinationId: string; name: string; students: number; average: number | null; passRate: number | null }[];
  recentActivity: { id: string; createdAt: string; actorName: string; action: string; summary: string }[];
  lastBackupAt: string | null;
  announcements: DashboardAnnouncementItem[];
}

export interface TeacherDashboard {
  role: 'TEACHER';
  className: string;
  subjects: { id: string; name: string }[];
  marks: { toEnter: number; rejected: number; awaitingReview: number; approved: number };
  marksToDo: { examinationSubjectId: string; examinationName: string; examDate: string; subjectName: string; marksStatus: string }[];
  assignments: { open: number; submissionsToGrade: number };
  assignmentsToGrade: { assignmentId: string; title: string; subjectName: string; dueAt: string; ungraded: number }[];
  upcomingExaminations: DashboardExamItem[];
  announcements: DashboardAnnouncementItem[];
}

export interface StudentDashboard {
  role: 'STUDENT';
  className: string;
  results: { published: number; averagePercentage: number | null; latest: MyResultSummary | null };
  assignments: { toDo: number; overdue: number; submissionsEnabled: boolean };
  assignmentsToDo: { id: string; title: string; subjectName: string; dueAt: string; maxMarks: number; state: 'OPEN' | 'OVERDUE' }[];
  recentGrades: { submissionId: string; assignmentTitle: string; subjectName: string; score: number; maxMarks: number; gradedAt: string | null }[];
  upcomingExaminations: DashboardExamItem[];
  announcements: DashboardAnnouncementItem[];
}

export type DashboardView = ClassMasterDashboard | TeacherDashboard | StudentDashboard;
