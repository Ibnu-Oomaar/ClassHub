export type SubmissionStatus = 'SUBMITTED' | 'GRADED';

export interface SubmissionView {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  dueAt: Date;
  studentId: string;
  studentName: string;
  studentCode: string;
  textAnswer: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  submittedAt: Date;
  isLate: boolean;
  /** For students, GRADED only once the teacher released the grade. */
  status: SubmissionStatus;
  /** Hidden from students until released. */
  score: number | null;
  feedback: string | null;
  isReleased: boolean;
  gradedAt: Date | null;
}

export type OverviewStatus = 'NOT_SUBMITTED' | SubmissionStatus;

export interface AssignmentOverviewRow {
  studentId: string;
  studentName: string;
  studentCode: string;
  submissionId: string | null;
  status: OverviewStatus;
  submittedAt: Date | null;
  isLate: boolean;
  score: number | null;
  isReleased: boolean;
}

/** Everyone in the class against one assignment: who submitted, who is late, who is still missing. */
export interface AssignmentOverview {
  assignmentId: string;
  title: string;
  subjectName: string;
  maxMarks: number;
  dueAt: Date;
  counts: { students: number; submitted: number; graded: number; late: number; missing: number };
  rows: AssignmentOverviewRow[];
}
