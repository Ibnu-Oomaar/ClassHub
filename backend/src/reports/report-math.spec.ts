import { average, classStats, rankDescending, round2 } from './report-math';

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(2.5)).toBe(2.5);
  });
});

describe('average', () => {
  it('is null for nothing to average', () => {
    expect(average([])).toBeNull();
  });

  it('takes the mean', () => {
    expect(average([90, 80, 70])).toBe(80);
  });

  it('rounds half a hundredth up instead of drifting down through floating point', () => {
    expect(average([76.66, 76.67])).toBe(76.67);
  });
});

describe('classStats', () => {
  it('has nothing to report for an empty class', () => {
    expect(classStats([])).toEqual({ count: 0, average: null, highest: null, lowest: null, passRate: null });
  });

  it('reports the average, the extremes and the pass rate of those who were judged', () => {
    const stats = classStats([
      { percentage: 90, isPassing: true },
      { percentage: 50, isPassing: false },
      { percentage: 70, isPassing: null },
    ]);
    expect(stats).toEqual({ count: 3, average: 70, highest: 90, lowest: 50, passRate: 50 });
  });

  it('has no pass rate when nobody was judged pass or fail', () => {
    expect(classStats([{ percentage: 60, isPassing: null }]).passRate).toBeNull();
  });
});

describe('rankDescending', () => {
  const items = [
    { name: 'dee', value: 5 },
    { name: 'bob', value: 20 },
    { name: 'ann', value: 20 },
    { name: 'cat', value: 10 },
  ];

  it('shares a rank between equal values and skips the next', () => {
    const ranked = rankDescending(items, (item) => item.value, (a, b) => a.name.localeCompare(b.name));
    expect(ranked.map((row) => [row.item.name, row.rank])).toEqual([['ann', 1], ['bob', 1], ['cat', 3], ['dee', 4]]);
  });

  it('does not change the list it is given', () => {
    const copy = [...items];
    rankDescending(items, (item) => item.value, () => 0);
    expect(items).toEqual(copy);
  });
});
