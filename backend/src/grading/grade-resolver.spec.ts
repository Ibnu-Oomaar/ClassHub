import { BandLike, resolveBand } from './grade-resolver';

const band = (grade: string, minMark: number, maxMark: number, isPassing = true): BandLike => ({ grade, minMark, maxMark, remark: null, isPassing });

const scale = [band('A', 25, 30), band('B', 20, 24.99), band('C', 15, 19.99), band('D', 10, 14.99), band('F', 0, 9.99, false)];

describe('resolveBand', () => {
  it('returns the grade range containing the actual mark', () => {
    expect(resolveBand(30, scale)?.grade).toBe('A');
    expect(resolveBand(22, scale)?.grade).toBe('B');
    expect(resolveBand(12.5, scale)?.grade).toBe('D');
    expect(resolveBand(5, scale)?.grade).toBe('F');
  });

  it('includes both edges of a configured mark range', () => {
    expect(resolveBand(25, scale)?.grade).toBe('A');
    expect(resolveBand(24.99, scale)?.grade).toBe('B');
    expect(resolveBand(0, scale)?.grade).toBe('F');
    expect(resolveBand(30.01, scale)).toBeNull();
  });

  it('does not depend on the order the bands are stored in', () => {
    const shuffled = [scale[3], scale[0], scale[4], scale[2], scale[1]];
    for (const mark of [0, 9.99, 10, 14.99, 15, 19.99, 25, 30]) {
      expect(resolveBand(mark, shuffled)?.grade).toBe(resolveBand(mark, scale)?.grade);
    }
  });

  it('forgives floating-point noise at a mark boundary', () => {
    expect(resolveBand(24.9999999995, scale)?.grade).toBe('A');
  });

  it('returns the band itself so the pass flag and remark travel with it', () => {
    expect(resolveBand(5, scale)).toBe(scale[4]);
    expect(resolveBand(5, scale)?.isPassing).toBe(false);
  });

  it('returns null when no scale is configured or nothing matches', () => {
    expect(resolveBand(15, [])).toBeNull();
    expect(resolveBand(-1, scale)).toBeNull();
    expect(resolveBand(15, [band('A', 20, 30)])).toBeNull();
  });
});
