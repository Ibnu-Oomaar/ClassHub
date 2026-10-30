import { describe, expect, it } from 'vitest';
import { gradingScaleSchema } from './grading-scale-dialog';
import { gradeFor } from './types';

const scaleValues = {
  name: 'Actual marks',
  description: '',
  maxMark: '150',
  bands: [
    { grade: 'A', minMark: '100', maxMark: '150', remark: 'Excellent', isPassing: true },
    { grade: 'F', minMark: '0', maxMark: '99.99', remark: 'Fail', isPassing: false },
  ],
  activate: false,
};

describe('gradingScaleSchema', () => {
  it('accepts actual-mark ranges beyond 100', () => {
    expect(gradingScaleSchema.safeParse(scaleValues).success).toBe(true);
  });

  it('rejects reversed ranges', () => {
    const values = { ...scaleValues, bands: [{ ...scaleValues.bands[0], minMark: '120', maxMark: '100' }] };
    expect(gradingScaleSchema.safeParse(values).success).toBe(false);
  });

  it('rejects overlapping ranges', () => {
    const values = {
      ...scaleValues,
      bands: [
        { grade: 'A', minMark: '90', maxMark: '150', remark: '', isPassing: true },
        { grade: 'F', minMark: '0', maxMark: '100', remark: '', isPassing: false },
      ],
    };
    expect(gradingScaleSchema.safeParse(values).success).toBe(false);
  });

  it('rejects ranges above the configured scale maximum', () => {
    const values = { ...scaleValues, maxMark: '100' };
    expect(gradingScaleSchema.safeParse(values).success).toBe(false);
  });
});

describe('gradeFor', () => {
  const bands = [
    { grade: 'A', minMark: 25, maxMark: 30, remark: 'Excellent', isPassing: true },
    { grade: 'B', minMark: 20, maxMark: 24.99, remark: 'Very good', isPassing: true },
    { grade: 'F', minMark: 0, maxMark: 19.99, remark: 'Fail', isPassing: false },
  ];

  it('finds the grade from the inclusive actual-mark range', () => {
    expect(gradeFor(27, bands)?.grade).toBe('A');
    expect(gradeFor(24.99, bands)?.grade).toBe('B');
    expect(gradeFor(10, bands)?.grade).toBe('F');
    expect(gradeFor(30.01, bands)).toBeNull();
  });
});
