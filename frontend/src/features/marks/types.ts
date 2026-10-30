import type { MarksStatus } from '@/features/examinations/types';

export interface MarkEntry {
  markId: string | null;
  studentId: string;
  studentName: string;
  studentCode: string;
  score: number | null;
  isAbsent: boolean;
  remarks: string | null;
  percentage: number | null;
  grade: string | null;
}

export interface MarkSheet {
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
  submittedAt: string | null;
  reviewedAt: string | null;
  resultsPublished: boolean;
  canEdit: boolean;
  gradingConfigured: boolean;
  entered: number;
  total: number;
  entries: MarkEntry[];
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
  submittedAt: string | null;
  reviewedAt: string | null;
  entered: number;
}
