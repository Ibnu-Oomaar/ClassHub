import { computeStandings, fromCents, percentageOf, StandingInput, toCents } from './standings';

const entry = (studentId: string, ...marks: [score: number, max: number][]): StandingInput => ({
  studentId,
  marks: marks.map(([score, max], index) => ({ subjectId: `subject-${index}`, scoreCents: toCents(score), maxCents: toCents(max) })),
});

describe('cents helpers', () => {
  it('avoids floating-point drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(12.5)).toBe(1250);
    expect(fromCents(1250)).toBe(12.5);
  });

  it('calculates percentages to two decimals and never divides by zero', () => {
    expect(percentageOf(100, 300)).toBe(33.33);
    expect(percentageOf(2, 3)).toBe(66.67);
    expect(percentageOf(10000, 10000)).toBe(100);
    expect(percentageOf(5, 0)).toBe(0);
  });
});

describe('computeStandings', () => {
  it('totals the marks and ranks the best result first', () => {
    const standings = computeStandings([entry('b', [60, 100], [70, 100]), entry('a', [90, 100], [80, 100]), entry('c', [40, 100], [50, 100])]);
    expect(standings.map((row) => [row.studentId, row.rank])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    expect(standings[0]).toMatchObject({ totalScoreCents: 17000, totalMaxCents: 20000, percentage: 85, subjectsCount: 2 });
  });

  it('gives equal results the same rank and skips the next one', () => {
    const standings = computeStandings([entry('a', [90, 100]), entry('b', [90, 100]), entry('c', [80, 100]), entry('d', [70, 100])]);
    expect(standings.map((row) => row.rank)).toEqual([1, 1, 3, 4]);
  });

  it('breaks ties between equal results by student id so the order is stable', () => {
    const standings = computeStandings([entry('z', [50, 100]), entry('m', [50, 100]), entry('a', [50, 100])]);
    expect(standings.map((row) => row.studentId)).toEqual(['a', 'm', 'z']);
    expect(standings.map((row) => row.rank)).toEqual([1, 1, 1]);
  });

  it('compares the real fractions, not the rounded percentages', () => {
    // 45/50 and 90/100 are the same fraction even though the totals differ.
    const tied = computeStandings([entry('a', [45, 50]), entry('b', [90, 100])]);
    expect(tied.map((row) => row.rank)).toEqual([1, 1]);

    // 200/300 and 200.01/300 both show as 66.67% but are not the same result.
    const close = computeStandings([entry('low', [200, 300]), entry('high', [200.01, 300])]);
    expect(close.map((row) => row.percentage)).toEqual([66.67, 66.67]);
    expect(close.map((row) => [row.studentId, row.rank])).toEqual([['high', 1], ['low', 2]]);
  });

  it('ranks by percentage when exams have different totals', () => {
    const standings = computeStandings([entry('a', [99, 100]), entry('b', [50, 50])]);
    expect(standings.map((row) => row.studentId)).toEqual(['b', 'a']);
  });

  it('counts an absent student as zero marks out of the maximum', () => {
    const standings = computeStandings([entry('present', [60, 100]), entry('absent', [0, 100])]);
    expect(standings.find((row) => row.studentId === 'absent')).toMatchObject({ percentage: 0, rank: 2 });
  });

  it('leaves out students who have no marks at all', () => {
    const standings = computeStandings([entry('a', [10, 100]), { studentId: 'none', marks: [] }]);
    expect(standings.map((row) => row.studentId)).toEqual(['a']);
  });

  it('handles an empty class', () => {
    expect(computeStandings([])).toEqual([]);
  });
});
