export interface GradeBandView {
  id: string;
  grade: string;
  minMark: number;
  maxMark: number;
  remark: string | null;
  isPassing: boolean;
}

export interface GradingScaleView {
  id: string;
  name: string;
  description: string | null;
  maxMark: number;
  isActive: boolean;
  bands: GradeBandView[];
  createdAt: Date;
  updatedAt: Date;
}

/** Result of grading a mark. Null grade means no configured range matches. */
export interface GradeResult {
  grade: string | null;
  remark: string | null;
  isPassing: boolean | null;
}
