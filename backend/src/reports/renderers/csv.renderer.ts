import { ReportCell, ReportDocument } from '../types/report.types.interface';

const UTF8_BOM = '﻿';
const LINE_BREAK = '\r\n';

/**
 * Spreadsheet programs run text that starts with = + - @ as a formula. Names and remarks come from
 * users, so such text is prefixed with an apostrophe to keep it plain text (CSV injection).
 */
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: ReportCell): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : neutralise(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const line = (values: readonly ReportCell[]): string => values.map(cell).join(',');

/**
 * CSV with a UTF-8 byte-order mark (so Excel reads Arabic and other non-Latin names correctly),
 * CRLF line ends and every section one after another, separated by a blank line.
 */
export function renderCsv(document: ReportDocument): Buffer {
  const lines: string[] = [];
  lines.push(line([document.title]));
  if (document.subtitle) lines.push(line([document.subtitle]));
  lines.push(line(['Class', document.className]));
  lines.push(line(['Generated', document.generatedAt.toISOString()]));

  if (document.summary.length > 0) {
    lines.push('');
    for (const item of document.summary) lines.push(line([item.label, item.value]));
  }

  for (const section of document.sections) {
    lines.push('');
    if (section.heading) lines.push(line([section.heading]));
    if (section.rows.length === 0) {
      lines.push(line([section.emptyMessage]));
      continue;
    }
    lines.push(line(section.columns.map((column) => column.label)));
    for (const row of section.rows) {
      lines.push(line(section.columns.map((column) => row[column.key] ?? null)));
    }
  }

  if (document.notes.length > 0) {
    lines.push('');
    for (const note of document.notes) lines.push(line([`Note: ${note}`]));
  }

  return Buffer.from(UTF8_BOM + lines.join(LINE_BREAK) + LINE_BREAK, 'utf8');
}
