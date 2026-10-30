import { buildPaginated, skipFor } from '../pagination/pagination.util';
import { escapeLike, resolveSort } from './sort.util';

describe('resolveSort', () => {
  const allowed = { name: 'student.fullName', createdAt: 'student.createdAt' };

  it('maps a known key to its column', () => {
    expect(resolveSort('name', allowed, 'createdAt')).toBe('student.fullName');
  });

  it('falls back for unknown keys instead of putting them into the query', () => {
    expect(resolveSort('fullName; DROP TABLE students', allowed, 'createdAt')).toBe('student.createdAt');
    expect(resolveSort(undefined, allowed, 'createdAt')).toBe('student.createdAt');
    expect(resolveSort('toString', allowed, 'createdAt')).toBe('student.createdAt');
    expect(resolveSort('__proto__', allowed, 'createdAt')).toBe('student.createdAt');
  });
});

describe('escapeLike', () => {
  it('makes wildcard characters match themselves', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('pagination', () => {
  it('works out how many pages there are, and always at least one', () => {
    expect(buildPaginated([], 0, 1, 10).meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
    expect(buildPaginated([1], 25, 1, 10).meta.totalPages).toBe(3);
    expect(buildPaginated([1], 30, 1, 10).meta.totalPages).toBe(3);
  });

  it('skips the right number of rows', () => {
    expect(skipFor(1, 10)).toBe(0);
    expect(skipFor(3, 10)).toBe(20);
  });
});
