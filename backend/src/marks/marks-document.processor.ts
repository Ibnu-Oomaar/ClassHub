import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { PDFParse } from 'pdf-parse';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

export interface ExtractedMarkRecord {
  studentId: string;
  score: string;
  recordNumber: number;
}

const MAX_RECORDS = 500;
const CSV_DELIMITERS = [',', ';', '\t', '|'];

function headerIndexes(values: unknown[]): { studentId: number; score: number } | null {
  const headers = values.map((value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const studentIds = headers.flatMap((header, index) => (header === 'studentid' ? [index] : []));
  const scores = headers.flatMap((header, index) => (header === 'score' ? [index] : []));
  if (studentIds.length !== 1 || scores.length !== 1 || studentIds[0] === scores[0]) return null;
  return { studentId: studentIds[0], score: scores[0] };
}

function cellText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function excelRowCells(row: ExcelJS.Row): unknown[] {
  const cells: unknown[] = [];
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cells[columnNumber - 1] = cell.value;
  });
  return cells;
}

function recordsFromRows(rows: unknown[][], indexes: { studentId: number; score: number }, firstRecordNumber: number): ExtractedMarkRecord[] {
  const records = rows
    .map((row, index) => ({
      studentId: cellText(row[indexes.studentId]),
      score: cellText(row[indexes.score]),
      recordNumber: firstRecordNumber + index,
    }))
    .filter((record) => record.studentId !== '' || record.score !== '');
  if (records.length === 0) throw new BadRequestException('The document contains no mark records.');
  if (records.length > MAX_RECORDS) throw new PayloadTooLargeException(`A maximum of ${MAX_RECORDS} mark records can be imported at once.`);
  return records;
}

function parseCsvDocument(buffer: Buffer): ExtractedMarkRecord[] {
  if (buffer.includes(0)) throw new BadRequestException('The CSV document is not a readable text file.');
  const text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) throw new BadRequestException('The CSV document is not valid UTF-8 text.');

  const matches: { rows: string[][]; indexes: { studentId: number; score: number } }[] = [];
  for (const delimiter of CSV_DELIMITERS) {
    try {
      const rows = parseCsv(text, {
        bom: true,
        delimiter,
        ltrim: true,
        relax_column_count: false,
        rtrim: true,
        skip_empty_lines: true,
        max_record_size: 100_000,
      }) as string[][];
      const indexes = rows.length > 0 ? headerIndexes(rows[0]) : null;
      if (indexes) matches.push({ rows, indexes });
    } catch {
      continue;
    }
  }
  if (matches.length !== 1) {
    throw new BadRequestException('The CSV must have one clear Student ID and Score header row and use a supported delimiter.');
  }
  const { rows, indexes } = matches[0];
  return recordsFromRows(rows.slice(1), indexes, 2);
}

async function parseExcelDocument(buffer: Buffer): Promise<ExtractedMarkRecord[]> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('The uploaded file is not a valid .xlsx workbook.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new BadRequestException('The .xlsx workbook is corrupted or cannot be read.');
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new BadRequestException('The .xlsx workbook is empty.');

  const headerRows: { rowNumber: number; indexes: { studentId: number; score: number } }[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 20) return;
    const indexes = headerIndexes(excelRowCells(row));
    if (indexes) headerRows.push({ rowNumber, indexes });
  });
  if (headerRows.length !== 1) {
    throw new BadRequestException('The .xlsx workbook must have one clear Student ID and Score header row near the top.');
  }

  const { rowNumber, indexes } = headerRows[0];
  const records: ExtractedMarkRecord[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, currentRowNumber) => {
    if (currentRowNumber > rowNumber) {
      records.push({
        studentId: cellText(row.getCell(indexes.studentId + 1).value),
        score: cellText(row.getCell(indexes.score + 1).value),
        recordNumber: currentRowNumber,
      });
    }
  });
  const nonEmpty = records.filter((record) => record.studentId !== '' || record.score !== '');
  if (nonEmpty.length === 0) throw new BadRequestException('The .xlsx workbook contains no mark records.');
  if (nonEmpty.length > MAX_RECORDS) throw new PayloadTooLargeException(`A maximum of ${MAX_RECORDS} mark records can be imported at once.`);
  return nonEmpty;
}

function pdfHeaderIndexes(line: string): { studentId: number; score: number } | null {
  const cells = line.split(/\t+|\s{2,}/).map((cell) => cell.trim());
  const indexes = headerIndexes(cells);
  if (indexes) return indexes;
  if (cells.length !== 1) return null;

  const words = line.split(/\s+/).map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (words.length === 3 && words[0] === 'student' && words[1] === 'id' && words[2] === 'score') {
    return { studentId: 0, score: 1 };
  }
  if (words.length === 3 && words[0] === 'score' && words[1] === 'student' && words[2] === 'id') {
    return { studentId: 1, score: 0 };
  }
  return null;
}

async function parsePdfDocument(buffer: Buffer): Promise<ExtractedMarkRecord[]> {
  if (buffer.length < 5 || buffer.toString('ascii', 0, 5) !== '%PDF-') {
    throw new BadRequestException('The uploaded file is not a valid PDF document.');
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headers = lines.flatMap((line, index) => {
      const indexes = pdfHeaderIndexes(line);
      return indexes ? [{ lineNumber: index, indexes }] : [];
    });
    if (headers.length === 0 || headers.some(({ indexes }) =>
      indexes.studentId !== headers[0].indexes.studentId || indexes.score !== headers[0].indexes.score,
    )) {
      throw new BadRequestException('A text-based PDF with a clear Student ID and Score table header is required. Scanned or image-only PDFs cannot be read.');
    }

    const { lineNumber, indexes } = headers[0];
    const records: ExtractedMarkRecord[] = [];
    for (let index = lineNumber + 1; index < lines.length; index++) {
      const line = lines[index];
      if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(line)) continue;
      if (pdfHeaderIndexes(line)) continue;
      const cells = line.split(/\t+|\s{2,}/).map((cell) => cell.trim());
      if (cells.length === 1) {
        const simpleRow = line.split(/\s+/);
        if (simpleRow.length === 2) cells.splice(0, 1, ...simpleRow);
      }
      records.push({
        studentId: cells[indexes.studentId] ?? '',
        score: cells[indexes.score] ?? '',
        recordNumber: records.length + 1,
      });
    }
    const nonEmpty = records.filter((record) => record.studentId !== '' || record.score !== '');
    if (nonEmpty.length === 0) throw new BadRequestException('The PDF contains no mark records.');
    if (nonEmpty.length > MAX_RECORDS) {
      throw new PayloadTooLargeException(`A maximum of ${MAX_RECORDS} mark records can be imported at once.`);
    }
    return nonEmpty;
  } catch (error: unknown) {
    if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('The PDF is corrupted or unreadable. A text-based PDF is required.');
  } finally {
    await parser.destroy();
  }
}

export async function extractMarkRecords(file: Express.Multer.File): Promise<ExtractedMarkRecord[]> {
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'xlsx' && extension !== 'csv') {
    throw new BadRequestException('Only PDF, .xlsx, and CSV documents are supported.');
  }
  if (!file.buffer?.length) throw new BadRequestException('Choose a non-empty document to upload.');

  if (extension === 'pdf') return parsePdfDocument(file.buffer);
  if (extension === 'xlsx') return parseExcelDocument(file.buffer);
  return parseCsvDocument(file.buffer);
}
