export type SubmissionStatus = 'SUBMITTED' | 'GRADED';

export interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  dueAt: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  textAnswer: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  submittedAt: string;
  isLate: boolean;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  isReleased: boolean;
  gradedAt: string | null;
}

export interface AssignmentOverviewRow {
  studentId: string;
  studentName: string;
  studentCode: string;
  submissionId: string | null;
  status: 'NOT_SUBMITTED' | SubmissionStatus;
  submittedAt: string | null;
  isLate: boolean;
  score: number | null;
  isReleased: boolean;
}

export interface AssignmentOverview {
  assignmentId: string;
  title: string;
  subjectName: string;
  maxMarks: number;
  dueAt: string;
  counts: { students: number; submitted: number; graded: number; late: number; missing: number };
  rows: AssignmentOverviewRow[];
}
