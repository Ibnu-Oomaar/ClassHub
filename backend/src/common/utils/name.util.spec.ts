import { nameKey, normalizeFullName, normalizeStudentId } from './name.util';

describe('name utilities', () => {
  it('trims and collapses spaces in a full name', () => {
    expect(normalizeFullName('  Ali   Hassan ')).toBe('Ali Hassan');
    expect(normalizeFullName('Ali\t\nHassan')).toBe('Ali Hassan');
  });

  it('treats differently written but identical names as the same person', () => {
    expect(nameKey('ali  HASSAN')).toBe(nameKey('Ali Hassan'));
    expect(nameKey('José')).toBe(nameKey('José'));
    expect(nameKey('Ali Hassan')).not.toBe(nameKey('Ali Hasan'));
  });

  it('keeps Arabic names intact', () => {
    expect(normalizeFullName(' محمد   يوسف ')).toBe('محمد يوسف');
  });

  it('stores Student IDs in capitals without spaces', () => {
    expect(normalizeStudentId(' st-001 ')).toBe('ST-001');
    expect(normalizeStudentId('st 001')).toBe('ST001');
    expect(normalizeStudentId('ST-001')).toBe('ST-001');
  });
});
