export enum ExaminationType {
  QUIZ = 'QUIZ',
  TEST = 'TEST',
  MIDTERM = 'MIDTERM',
  FINAL = 'FINAL',
  MOCK = 'MOCK',
  OTHER = 'OTHER',
}

/**
 * DRAFT: only the Class Master sees it. SCHEDULED / COMPLETED: visible to teachers and students,
 * marks can be entered. CANCELLED: visible but marks cannot be entered.
 */
export enum ExaminationStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Marks workflow for one subject of one examination:
 * PENDING -> DRAFT (teacher saves) -> SUBMITTED (teacher submits) -> APPROVED | REJECTED (Class Master).
 * REJECTED goes back to the teacher, who corrects and submits again.
 */
export enum MarksStatus {
  PENDING = 'PENDING',
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Statuses a teacher may enter or edit marks in. */
export const MARKS_EDITABLE_STATUSES: readonly MarksStatus[] = [MarksStatus.PENDING, MarksStatus.DRAFT, MarksStatus.REJECTED];

/** Examination statuses that allow marks entry. */
export const MARKS_ENTRY_EXAM_STATUSES: readonly ExaminationStatus[] = [ExaminationStatus.SCHEDULED, ExaminationStatus.COMPLETED];

export interface ExaminationSubjectView {
  /** examination_subjects.id: the handle used by the marks endpoints. */
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  maxMarks: number;
  /** Hidden from students. */
  marksStatus?: MarksStatus;
  reviewFeedback?: string | null;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
}

export interface ExaminationView {
  id: string;
  name: string;
  type: ExaminationType;
  examDate: string;
  academicPeriod: string | null;
  instructions: string | null;
  status: ExaminationStatus;
  resultsPublished: boolean;
  resultsPublishedAt: Date | null;
  subjects: ExaminationSubjectView[];
  createdAt: Date;
  updatedAt: Date;
}
