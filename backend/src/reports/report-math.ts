/** Pure helpers used by the report builders. */

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Mean rounded to 2 decimals. Values are summed as whole hundredths so a mean such as 76.665 rounds
 * to 76.67 instead of drifting to 76.66 through floating-point error.
 */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const hundredths = values.reduce((sum, value) => sum + Math.round(value * 100), 0);
  return Math.round(hundredths / values.length) / 100;
}

export interface ClassStats {
  count: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  /** Share of students that passed, in percent. Null when nothing says who passed. */
  passRate: number | null;
}

export function classStats(entries: readonly { percentage: number; isPassing: boolean | null }[]): ClassStats {
  if (entries.length === 0) {
    return { count: 0, average: null, highest: null, lowest: null, passRate: null };
  }
  const percentages = entries.map((entry) => entry.percentage);
  const judged = entries.filter((entry) => entry.isPassing !== null);
  return {
    count: entries.length,
    average: average(percentages),
    highest: Math.max(...percentages),
    lowest: Math.min(...percentages),
    passRate: judged.length === 0 ? null : round2((judged.filter((entry) => entry.isPassing).length / judged.length) * 100),
  };
}

/**
 * Competition ranking by a number, highest first: equal values share a rank and the next rank is
 * skipped (1, 2, 2, 4). Returns the items with their rank, in rank order.
 */
export function rankDescending<T>(items: readonly T[], valueOf: (item: T) => number, tieBreak: (a: T, b: T) => number): { item: T; rank: number }[] {
  const ordered = [...items].sort((a, b) => valueOf(b) - valueOf(a) || tieBreak(a, b));
  const ranked: { item: T; rank: number }[] = [];
  ordered.forEach((item, index) => {
    const previous = ranked[index - 1];
    const rank = previous && valueOf(previous.item) === valueOf(item) ? previous.rank : index + 1;
    ranked.push({ item, rank });
  });
  return ranked;
}
