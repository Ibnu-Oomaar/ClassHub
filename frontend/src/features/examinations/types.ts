export type ExaminationType = 'QUIZ' | 'TEST' | 'MIDTERM' | 'FINAL' | 'MOCK' | 'OTHER';
export type ExaminationStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type MarksStatus = 'PENDING' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export const EXAMINATION_TYPES: ExaminationType[] = ['QUIZ', 'TEST', 'MIDTERM', 'FINAL', 'MOCK', 'OTHER'];
export const EXAMINATION_STATUSES: ExaminationStatus[] = ['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'];

export interface ExaminationSubject {
  /** The handle the marks screens use. */
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  maxMarks: number;
  /** Not sent to students. */
  marksStatus?: MarksStatus;
  reviewFeedback?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export interface Examination {
  id: string;
  name: string;
  type: ExaminationType;
  examDate: string;
  academicPeriod: string | null;
  instructions: string | null;
  status: ExaminationStatus;
  resultsPublished: boolean;
  resultsPublishedAt: string | null;
  subjects: ExaminationSubject[];
  createdAt: string;
  updatedAt: string;
}
