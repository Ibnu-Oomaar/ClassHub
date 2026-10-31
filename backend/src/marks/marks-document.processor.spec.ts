import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { createCanvas } from '@napi-rs/canvas';
import { BadRequestException } from '@nestjs/common';
import { afterEach } from '@jest/globals';
import { extractMarkRecords, terminateOcrWorker } from './marks-document.processor';

afterEach(async () => {
  await terminateOcrWorker();
});

function uploadedFile(name: string, buffer: Buffer): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    buffer,
    destination: '',
    filename: name,
    path: '',
    stream: undefined as never,
  };
}

describe('marks document processing', () => {
  it('reads quoted CSV records and detects header names regardless of case and spaces', async () => {
    const file = uploadedFile('marks.csv', Buffer.from('  Student ID ; sCoRe \r\n "ST-001" ; 82.5 \r\n'));
    await expect(extractMarkRecords(file)).resolves.toEqual([{ studentId: 'ST-001', score: '82.5', recordNumber: 2 }]);
  });

  it('reads XLSX records without assuming a fixed column order', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Marks');
    worksheet.addRow(['Score', 'Student ID', 'Student Name']);
    worksheet.addRow([91, 'ST-002', 'Student']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(extractMarkRecords(uploadedFile('marks.xlsx', buffer))).resolves.toEqual([
      { studentId: 'ST-002', score: '91', recordNumber: 2 },
    ]);
  });

  it('reads text-based PDFs with a clear tabular header', async () => {
    const document = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.text('Student ID', 50, 50);
    document.text('Score', 250, 50);
    document.text('ST-003 Jane Doe 76', 50, 80);
    document.end();

    const records = await extractMarkRecords(uploadedFile('marks.pdf', await finished), ['ST-003']);
    expect(records).toEqual([
      expect.objectContaining({ studentId: 'ST-003', studentName: expect.stringMatching(/Jane Doe/i), score: '76', recordNumber: 1 }),
    ]);
  });

  it('uses the bundled local OCR model for scanned PDFs without fixed headers', async () => {
    const canvas = createCanvas(1200, 260);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 64px Arial';
    context.fillText('ST-004 Jane Doe 88', 40, 150);

    const document = new PDFDocument({ margin: 20 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.image(canvas.toBuffer('image/png'), 20, 20, { width: 560 });
    document.end();

    const records = await extractMarkRecords(uploadedFile('scanned-results.pdf', await finished), ['ST-004']);
    expect(records).toEqual([
      expect.objectContaining({ studentId: 'ST-004', studentName: expect.stringMatching(/Jane Doe/i), score: '88' }),
    ]);
  });

  it('rejects unsupported extensions and non-text PDFs instead of guessing', async () => {
    await expect(extractMarkRecords(uploadedFile('marks.xls', Buffer.from('PK')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(extractMarkRecords(uploadedFile('marks.xlsx', Buffer.from('%PDF-1.4')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(extractMarkRecords(uploadedFile('scan.pdf', Buffer.from('%PDF-1.4 invalid')))).rejects.toBeInstanceOf(BadRequestException);
  });
});
