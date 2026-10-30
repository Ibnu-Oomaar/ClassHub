/** Largest number of files a teacher can attach to one assignment. */
export const MAX_ASSIGNMENT_ATTACHMENTS = 5;

export interface AssignmentAttachmentView {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/** What the signed-in student has done for an assignment. Score and feedback appear only once released. */
export interface MySubmissionSummary {
  id: string;
  status: 'SUBMITTED' | 'GRADED';
  submittedAt: Date;
  isLate: boolean;
  score: number | null;
  feedback: string | null;
}

/**
 * OPEN: before the deadline. OVERDUE: past the deadline but late work is still accepted.
 * CLOSED: past the deadline and late work is not accepted.
 */
export type AssignmentState = 'OPEN' | 'OVERDUE' | 'CLOSED';

export interface AssignmentView {
  id: string;
  title: string;
  description: string | null;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  dueAt: Date;
  maxMarks: number;
  isAvailable: boolean;
  allowLateSubmissions: boolean;
  state: AssignmentState;
  /** Can a student submit right now (available, before the deadline or late allowed, submissions switched on)? */
  acceptsSubmissions: boolean;
  attachments: AssignmentAttachmentView[];
  /** Staff only: how many students submitted / how many are graded. */
  submissionsCount?: number;
  gradedCount?: number;
  /** Student only. Null when the student has not submitted yet. */
  mySubmission?: MySubmissionSummary | null;
  createdAt: Date;
  updatedAt: Date;
}
