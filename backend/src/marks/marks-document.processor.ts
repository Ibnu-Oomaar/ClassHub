import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { PDFParse } from 'pdf-parse';
import { OEM, createWorker, type Worker } from 'tesseract.js';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

export interface ExtractedMarkRecord {
  studentId: string;
  score: string;
  recordNumber: number;
  studentName?: string;
  extractionIssue?: string;
}

const MAX_RECORDS = 500;
const MAX_PDF_PAGES = 50;
const CSV_DELIMITERS = [',', ';', '\t', '|'];
const nodeRequire = createRequire(__filename);
const languageDataPath = resolve(dirname(nodeRequire.resolve('@tesseract.js-data/eng')), '4.0.0');
let ocrWorkerPromise: Promise<Worker> | null = null;

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceQuality(text: string, knownStudentIds: string[]): number {
  const knownIdCount = knownStudentIds.reduce((count, id) => {
    const matcher = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(id)}($|[^\\p{L}\\p{N}])`, 'giu');
    return count + [...text.matchAll(matcher)].length;
  }, 0);
  const contentLines = text.split(/\r?\n/).filter((line) => /\p{L}|\d/u.test(line)).length;
  return knownIdCount * 1000 + contentLines * 10 + Math.min(text.length, 9999) / 10000;
}

function extractPdfRecords(text: string, knownStudentIds: string[]): ExtractedMarkRecord[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^--\s*\d+\s+of\s+\d+\s*--$/.test(line));
  const ids = [...new Set(knownStudentIds.map((id) => id.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  const idPattern = ids.length > 0
    ? new RegExp(`(^|[^\\p{L}\\p{N}])(${ids.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu')
    : null;
  const records: ExtractedMarkRecord[] = [];

  for (const line of lines) {
    const foundIds = idPattern ? [...line.matchAll(idPattern)].map((match) => match[2]) : [];
    if (foundIds.length === 1) {
      const studentId = foundIds[0];
      const withoutId = line.replace(idPattern!, ' ').replace(/\s+/g, ' ').trim();
      const scoreMatches = [...withoutId.matchAll(/(?<![\p{L}\p{N}.])[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?![\p{L}\p{N}.])/gu)];
      const scoreMatch = scoreMatches.at(-1);
      const score = scoreMatch?.[0] ?? '';
      const studentName = scoreMatch
        ? `${withoutId.slice(0, scoreMatch.index)} ${withoutId.slice((scoreMatch.index ?? 0) + score.length)}`.replace(/\s+/g, ' ').trim()
        : withoutId;
      records.push({
        studentId,
        score,
        studentName,
        recordNumber: records.length + 1,
        ...(foundIds.length !== 1 || scoreMatches.length !== 1 || !studentName
          ? { extractionIssue: 'Student details were not clearly arranged on one row; verify or correct the extracted fields.' }
          : {}),
      });
      continue;
    }

    if (foundIds.length > 1 || /\d/.test(line)) {
      const tokens = line.match(/[\p{L}\p{N}][\p{L}\p{N}/-]{1,39}/gu) ?? [];
      const candidateId = foundIds.length > 1
        ? foundIds.join(', ')
        : tokens.find((token) => /[A-Za-z]/.test(token) && /\d/.test(token)) ?? '';
      const withoutId = candidateId ? line.replace(candidateId, ' ').replace(/\s+/g, ' ').trim() : line;
      const scoreMatches = foundIds.length > 1
        ? []
        : [...withoutId.matchAll(/(?<![\p{L}\p{N}.])[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?![\p{L}\p{N}.])/gu)];
      const scoreMatch = scoreMatches.at(-1);
      const score = scoreMatch?.[0] ?? '';
      records.push({
        studentId: candidateId,
        score,
        studentName: scoreMatch
          ? `${withoutId.slice(0, scoreMatch.index)} ${withoutId.slice((scoreMatch.index ?? 0) + score.length)}`.replace(/\s+/g, ' ').trim()
          : withoutId,
        recordNumber: records.length + 1,
        extractionIssue: candidateId
          ? 'Student ID could not be matched confidently. Review the ID and score manually.'
          : 'Student ID could not be identified confidently. Enter the ID and score manually.',
      });
    }
  }

  if (records.length === 0) {
    return lines.slice(0, MAX_RECORDS).map((line, index) => ({
      studentId: '',
      score: '',
      studentName: line,
      recordNumber: index + 1,
      extractionIssue: 'No student result row could be identified. Review and enter the student ID and score manually.',
    }));
  }
  if (records.length > MAX_RECORDS) throw new PayloadTooLargeException(`A maximum of ${MAX_RECORDS} mark records can be imported at once.`);
  return records;
}

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      langPath: languageDataPath,
      gzip: true,
      cacheMethod: 'none',
    }).catch((error: unknown) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  const pendingWorker = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (pendingWorker) await (await pendingWorker).terminate();
}

async function parsePdfDocument(buffer: Buffer, knownStudentIds: string[]): Promise<ExtractedMarkRecord[]> {
  if (buffer.length < 5 || buffer.toString('ascii', 0, 5) !== '%PDF-') {
    throw new BadRequestException('The uploaded file is not a valid PDF document.');
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const text = await parser.getText();
    if (text.total > MAX_PDF_PAGES) {
      throw new PayloadTooLargeException(`PDF documents are limited to ${MAX_PDF_PAGES} pages for local OCR processing.`);
    }

    const screenshots = await parser.getScreenshot({ scale: 1.75, imageDataUrl: false, imageBuffer: true });
    const worker = await getOcrWorker();
    const records: ExtractedMarkRecord[] = [];
    for (const screenshot of screenshots.pages) {
      const pageText = text.pages.find((page) => page.num === screenshot.pageNumber)?.text ?? '';
      const ocrResult = await worker.recognize(Buffer.from(screenshot.data));
      const ocrText = ocrResult.data.text;
      const selectedText = sourceQuality(pageText, knownStudentIds) >= sourceQuality(ocrText, knownStudentIds) ? pageText : ocrText;
      const pageRecords = extractPdfRecords(selectedText, knownStudentIds);
      for (const record of pageRecords) records.push({ ...record, recordNumber: records.length + 1 });
    }
    if (records.length === 0) {
      return extractPdfRecords(text.pages.map((page) => page.text).join('\n'), knownStudentIds);
    }
    if (records.length > MAX_RECORDS) {
      throw new PayloadTooLargeException(`A maximum of ${MAX_RECORDS} mark records can be imported at once.`);
    }
    return records;
  } catch (error: unknown) {
    if (error instanceof BadRequestException || error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('The PDF could not be processed locally. Verify that it is readable and try again.');
  } finally {
    await parser.destroy();
  }
}

export async function extractMarkRecords(file: Express.Multer.File, knownStudentIds: string[] = []): Promise<ExtractedMarkRecord[]> {
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'xlsx' && extension !== 'csv') {
    throw new BadRequestException('Only PDF, .xlsx, and CSV documents are supported.');
  }
  if (!file.buffer?.length) throw new BadRequestException('Choose a non-empty document to upload.');

  if (extension === 'pdf') return parsePdfDocument(file.buffer, knownStudentIds);
  if (extension === 'xlsx') return parseExcelDocument(file.buffer);
  return parseCsvDocument(file.buffer);
}
