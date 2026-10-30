export interface ResultSubject {
  subjectId: string;
  subjectName: string;
  score: number | null;
  maxMarks: number;
  percentage: number | null;
  grade: string | null;
  isAbsent: boolean;
}

export interface StandingRow {
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
  subjects: ResultSubject[];
}

export interface ExaminationStandings {
  examinationId: string;
  examinationName: string;
  published: boolean;
  publishedAt: string | null;
  subjectsTotal: number;
  subjectsApproved: number;
  readyToPublish: boolean;
  gradingConfigured: boolean;
  blockers: string[];
  classSize: number;
  rows: StandingRow[];
}

export interface PublishOutcome {
  examinationId: string;
  published: boolean;
  publishedAt: string | null;
  students: number;
  warnings: string[];
}

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
  publishedAt: string;
}

export interface MyResultDetail extends MyResultSummary {
  subjects: ResultSubject[];
}
