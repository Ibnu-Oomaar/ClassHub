export interface GradeBand {
  id: string;
  grade: string;
  minMark: number;
  maxMark: number;
  remark: string | null;
  isPassing: boolean;
}

export interface GradingScale {
  id: string;
  name: string;
  description: string | null;
  maxMark: number;
  isActive: boolean;
  bands: GradeBand[];
  createdAt: string;
  updatedAt: string;
}

/** The grade an actual mark earns on a scale. */
export function gradeFor(mark: number, bands: Pick<GradeBand, 'grade' | 'minMark' | 'maxMark' | 'isPassing' | 'remark'>[]) {
  const rounded = Math.round(mark * 100) / 100;
  return bands.find((band) => rounded >= band.minMark && rounded <= band.maxMark) ?? null;
}
