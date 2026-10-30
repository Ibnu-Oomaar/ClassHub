/** A grade band as the resolver needs it (the entity and API views both satisfy this). */
export interface BandLike {
  grade: string;
  minMark: number;
  maxMark: number;
  remark: string | null;
  isPassing: boolean;
}

/**
 * Finds the configured band containing the actual mark. The Class Master defines the ranges.
 * Returns null when there are no bands or no range contains the mark.
 */
export function resolveBand<T extends BandLike>(mark: number, bands: readonly T[]): T | null {
  for (const band of bands) {
    if (mark + 1e-9 >= band.minMark && mark <= band.maxMark + 1e-9) {
      return band;
    }
  }
  return null;
}
