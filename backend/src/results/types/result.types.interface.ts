export interface ResultSubjectView {
  subjectId: string;
  subjectName: string;
  score: number | null;
  maxMarks: number;
  percentage: number | null;
  grade: string | null;
  isAbsent: boolean;
}

/** One student's standing in one examination. */
export interface StandingRowView {
  rank: number;
  studentId: string;
  studentName: string;
  studentCode: string;
  totalScore: number;
  totalMax: number;
  percentage: number;
  grade: string | null;
  gradeRemark: string | null;
  isPassing: boolean | null;
  subjectsCount: number;
  subjects: ResultSubjectView[];
}

export interface ExaminationStandingsView {
  examinationId: string;
  examinationName: string;
  published: boolean;
  publishedAt: Date | null;
  subjectsTotal: number;
  subjectsApproved: number;
  /** All subjects approved: the results can be published. */
  readyToPublish: boolean;
  gradingConfigured: boolean;
  /** Reasons publishing is not possible yet (empty when ready). */
  blockers: string[];
  classSize: number;
  rows: StandingRowView[];
}

export interface PublishOutcome {
  examinationId: string;
  published: boolean;
  publishedAt: Date | null;
  students: number;
  /** Students who have marks in only some subjects, for the Class Master to double-check. */
  warnings: string[];
}

/** What a student sees for one published examination. */
export interface MyResultSummary {
  examinationId: string;
  examinationName: string;
  examinationType: string;
  examDate: string;
  academicPeriod: string | null;
  totalScore: number;
  totalMax: number;
  percentage: number;
  grade: string | null;
  gradeRemark: string | null;
  isPassing: boolean | null;
  rank: number;
  classSize: number;
  subjectsCount: number;
  publishedAt: Date;
}

export interface MyResultDetail extends MyResultSummary {
  subjects: ResultSubjectView[];
}
