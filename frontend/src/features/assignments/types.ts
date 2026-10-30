export const MAX_ASSIGNMENT_ATTACHMENTS = 5;

export interface AssignmentAttachment {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MySubmissionSummary {
  id: string;
  status: 'SUBMITTED' | 'GRADED';
  submittedAt: string;
  isLate: boolean;
  score: number | null;
  feedback: string | null;
}

export type AssignmentState = 'OPEN' | 'OVERDUE' | 'CLOSED';

export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  dueAt: string;
  maxMarks: number;
  isAvailable: boolean;
  allowLateSubmissions: boolean;
  state: AssignmentState;
  acceptsSubmissions: boolean;
  attachments: AssignmentAttachment[];
  /** Staff only. */
  submissionsCount?: number;
  gradedCount?: number;
  /** Student only. */
  mySubmission?: MySubmissionSummary | null;
  createdAt: string;
  updatedAt: string;
}
