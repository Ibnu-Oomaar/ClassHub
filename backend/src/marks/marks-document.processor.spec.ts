import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { extractMarkRecords } from './marks-document.processor';

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
    document.text('ST-003', 50, 80);
    document.text('76', 250, 80);
    document.end();

    await expect(extractMarkRecords(uploadedFile('marks.pdf', await finished))).resolves.toEqual([
      { studentId: 'ST-003', score: '76', recordNumber: 1 },
    ]);
  });

  it('rejects unsupported extensions and non-text PDFs instead of guessing', async () => {
    await expect(extractMarkRecords(uploadedFile('marks.xls', Buffer.from('PK')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(extractMarkRecords(uploadedFile('marks.xlsx', Buffer.from('%PDF-1.4')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(extractMarkRecords(uploadedFile('scan.pdf', Buffer.from('%PDF-1.4 invalid')))).rejects.toBeInstanceOf(BadRequestException);
  });
});
