import { ReportDocument } from '../types/report.types.interface';
import { renderCsv } from './csv.renderer';

const document = (overrides: Partial<ReportDocument> = {}): ReportDocument => ({
  title: 'Examination results: Midterm',
  subtitle: 'Term 1',
  className: '3C Morning Boys',
  generatedAt: new Date('2026-10-28T10:00:00Z'),
  summary: [{ label: 'Class average (%)', value: 62.8 }],
  sections: [
    {
      heading: 'Class ranking',
      columns: [
        { key: 'name', label: 'Student' },
        { key: 'percentage', label: 'Percent', align: 'right' },
      ],
      rows: [{ name: 'Abdirahman Ahmed Ali', percentage: 77.15 }],
      emptyMessage: 'Nobody yet.',
    },
  ],
  notes: ['Absent counts as zero.'],
  fileStem: 'examination-results',
  ...overrides,
});

const lines = (buffer: Buffer): string[] => buffer.toString('utf8').replace(/^﻿/, '').split('\r\n');

describe('renderCsv', () => {
  it('starts with a byte-order mark and uses CRLF line ends so Excel opens it correctly', () => {
    const buffer = renderCsv(document());
    expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buffer.toString('utf8').endsWith('\r\n')).toBe(true);
  });

  it('writes the header, summary, table and notes in order', () => {
    expect(lines(renderCsv(document()))).toEqual([
      'Examination results: Midterm',
      'Term 1',
      'Class,3C Morning Boys',
      'Generated,2026-10-28T10:00:00.000Z',
      '',
      'Class average (%),62.8',
      '',
      'Class ranking',
      'Student,Percent',
      'Abdirahman Ahmed Ali,77.15',
      '',
      'Note: Absent counts as zero.',
      '',
    ]);
  });

  it('quotes values with commas, quotes and line breaks', () => {
    const csv = lines(
      renderCsv(document({ sections: [{ heading: null, columns: [{ key: 'v', label: 'Remark' }], rows: [{ v: 'Good, but "late"' }, { v: 'two\nlines' }], emptyMessage: '' }] })),
    );
    expect(csv).toContain('"Good, but ""late"""');
    expect(csv.join('|')).toContain('"two\nlines"');
  });

  it('keeps text that starts like a formula from running as one in a spreadsheet', () => {
    const csv = lines(
      renderCsv(document({ sections: [{ heading: null, columns: [{ key: 'v', label: 'Name' }], rows: [{ v: '=HYPERLINK("http://x")' }, { v: '+1' }, { v: '-2+3' }, { v: '@SUM(A1)' }], emptyMessage: '' }] })),
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@SUM(A1)");
  });

  it('leaves real negative numbers alone', () => {
    const csv = lines(renderCsv(document({ sections: [{ heading: null, columns: [{ key: 'v', label: 'Change' }], rows: [{ v: -5 }], emptyMessage: '' }] })));
    expect(csv).toContain('-5');
  });

  it('writes empty cells for missing values', () => {
    const csv = lines(renderCsv(document({ sections: [{ heading: null, columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: [{ a: 'x', b: null }], emptyMessage: '' }] })));
    expect(csv).toContain('x,');
  });

  it('says so when a section is empty instead of printing a bare header', () => {
    const csv = lines(renderCsv(document({ sections: [{ heading: 'Marks', columns: [{ key: 'v', label: 'Score' }], rows: [], emptyMessage: 'No marks yet.' }] })));
    expect(csv).toContain('Marks');
    expect(csv).toContain('No marks yet.');
    expect(csv).not.toContain('Score');
  });

  it('keeps Arabic and other non-Latin text intact', () => {
    const csv = lines(renderCsv(document({ sections: [{ heading: null, columns: [{ key: 'v', label: 'الاسم' }], rows: [{ v: 'محمد يوسف' }], emptyMessage: '' }] })));
    expect(csv).toContain('الاسم');
    expect(csv).toContain('محمد يوسف');
  });

  it('leaves out the subtitle, summary and notes when there are none', () => {
    const csv = lines(renderCsv(document({ subtitle: null, summary: [], notes: [], sections: [] })));
    expect(csv).toEqual(['Examination results: Midterm', 'Class,3C Morning Boys', 'Generated,2026-10-28T10:00:00.000Z', '']);
  });
});
