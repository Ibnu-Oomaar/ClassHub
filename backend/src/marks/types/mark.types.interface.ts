import { MarksStatus } from '../../examinations/types/examination.types.interface';

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

/** One row of a mark sheet: a student of the class and whatever has been entered for them. */
export interface MarkEntryView {
  /** Null while nothing has been entered for this student yet. */
  markId: string | null;
  studentId: string;
  studentName: string;
  studentCode: string;
  score: number | null;
  isAbsent: boolean;
  remarks: string | null;
  /** Percentage of the subject's maximum, rounded to 2 decimals. Null without a score. */
  percentage: number | null;
  /** Live grade from the active scale (frozen value once results are published). Null if no scale or no score. */
  grade: string | null;
}

export interface MarkSheetView {
  examinationSubjectId: string;
  examinationId: string;
  examinationName: string;
  examinationStatus: string;
  examDate: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  marksStatus: MarksStatus;
  reviewFeedback: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  resultsPublished: boolean;
  /** True when the caller may change the marks right now. */
  canEdit: boolean;
  /** False when the Class Master has not configured/activated a grading scale yet. */
  gradingConfigured: boolean;
  entered: number;
  total: number;
  entries: MarkEntryView[];
}

export interface MarksQueueItem {
  examinationSubjectId: string;
  examinationId: string;
  examinationName: string;
  examDate: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  marksStatus: MarksStatus;
  reviewFeedback: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  entered: number;
}

/** Up to this many individual score changes are written into the audit trail per save. */
export const MAX_AUDITED_CHANGES = 100;
