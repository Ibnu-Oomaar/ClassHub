/**
 * Pure result calculations. Scores are handled in integer "cents" (score x 100) so sums and
 * comparisons never suffer from floating-point drift (0.1 + 0.2 style errors).
 */

export interface StandingMark {
  subjectId: string;
  /** Maximum marks of the subject x 100. */
  maxCents: number;
  /** The student's score x 100. Absent students count as 0. */
  scoreCents: number;
}

export interface StandingInput {
  studentId: string;
  marks: StandingMark[];
}

export interface Standing {
  studentId: string;
  totalScoreCents: number;
  totalMaxCents: number;
  subjectsCount: number;
  /** Percentage of the total, rounded to 2 decimals. */
  percentage: number;
  /** Competition ranking: equal results share a rank and the next rank is skipped (1, 2, 2, 4). */
  rank: number;
}

export const toCents = (value: number): number => Math.round(value * 100);
export const fromCents = (cents: number): number => cents / 100;

export function percentageOf(scoreCents: number, maxCents: number): number {
  return maxCents > 0 ? Math.round((scoreCents * 10000) / maxCents) / 100 : 0;
}

/**
 * Totals every student's marks, derives the percentage and ranks the class.
 * Students without any mark are left out: there is nothing to rank.
 */
export function computeStandings(inputs: readonly StandingInput[]): Standing[] {
  const totals = inputs
    .filter((input) => input.marks.length > 0)
    .map((input) => {
      const totalScoreCents = input.marks.reduce((sum, mark) => sum + mark.scoreCents, 0);
      const totalMaxCents = input.marks.reduce((sum, mark) => sum + mark.maxCents, 0);
      return {
        studentId: input.studentId,
        totalScoreCents,
        totalMaxCents,
        subjectsCount: input.marks.length,
        percentage: percentageOf(totalScoreCents, totalMaxCents),
      };
    });

  // Compare exact fractions (score/max) by cross-multiplication instead of rounded percentages.
  const ratioDescending = (a: (typeof totals)[number], b: (typeof totals)[number]): number =>
    b.totalScoreCents * a.totalMaxCents - a.totalScoreCents * b.totalMaxCents;

  const ordered = [...totals].sort((a, b) => ratioDescending(a, b) || a.studentId.localeCompare(b.studentId));

  const standings: Standing[] = [];
  ordered.forEach((entry, index) => {
    const previous = ordered[index - 1];
    const sameAsPrevious = previous !== undefined && ratioDescending(previous, entry) === 0;
    standings.push({ ...entry, rank: sameAsPrevious ? standings[index - 1].rank : index + 1 });
  });
  return standings;
}
