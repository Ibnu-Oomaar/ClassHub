import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { ReportCell, ReportColumn, ReportDocument, ReportSection } from '../types/report.types.interface';

export interface PdfFonts {
  regular: string | null;
  bold: string | null;
}

const COLORS = {
  ink: '#111827',
  muted: '#6b7280',
  headerFill: '#1f2937',
  headerText: '#ffffff',
  zebra: '#f3f4f6',
  rule: '#d1d5db',
};
const MARGIN = 36;
const FONT_SIZE = 8.5;
const CELL_PADDING_X = 4;
const CELL_PADDING_Y = 3;

/** The built-in PDF font can only draw Latin-1. Anything else would show as garbage, so it becomes "?". */
function toLatin(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^ -~ -ÿ]/g, '?');
}

function format(value: ReportCell): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return String(Number(value.toFixed(2)));
  return value;
}

/** Only use a configured font when the file really exists; otherwise fall back to the built-in one. */
export function resolveFonts(fonts: PdfFonts): { regular: string; bold: string; custom: boolean } {
  const regular = fonts.regular && existsSync(fonts.regular) ? fonts.regular : null;
  if (!regular) return { regular: 'Helvetica', bold: 'Helvetica-Bold', custom: false };
  const bold = fonts.bold && existsSync(fonts.bold) ? fonts.bold : regular;
  return { regular, bold, custom: true };
}

export function renderPdf(document: ReportDocument, configuredFonts: PdfFonts): Promise<Buffer> {
  const fonts = resolveFonts(configuredFonts);
  const text = (value: string): string => (fonts.custom ? value : toLatin(value));
  const widest = Math.max(0, ...document.sections.map((section) => section.columns.length));

  const pdf = new PDFDocument({
    size: 'A4',
    layout: widest > 6 ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: text(document.title), Author: 'CLASSHUB', Subject: text(document.className) },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const left = MARGIN;
  const usableWidth = (): number => pdf.page.width - MARGIN * 2;
  const bottomLimit = (): number => pdf.page.height - MARGIN - 18;
  const setFont = (bold: boolean, size: number): void => {
    pdf.font(bold ? fonts.bold : fonts.regular).fontSize(size);
  };

  // ----- Header
  setFont(true, 18);
  pdf.fillColor(COLORS.ink).text(text(document.title), left, MARGIN, { width: usableWidth() });
  if (document.subtitle) {
    setFont(false, 11);
    pdf.fillColor(COLORS.ink).text(text(document.subtitle), { width: usableWidth() });
  }
  setFont(false, 9);
  pdf
    .fillColor(COLORS.muted)
    .text(text(`${document.className}  |  Generated ${document.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`), { width: usableWidth() });
  pdf.moveDown(0.6);

  // ----- Summary (two label/value pairs per line)
  if (document.summary.length > 0) {
    const half = usableWidth() / 2;
    for (let index = 0; index < document.summary.length; index += 2) {
      const pair = document.summary.slice(index, index + 2);
      const y = pdf.y;
      let used = 0;
      pair.forEach((item, column) => {
        setFont(false, 9);
        const label = text(`${item.label}: `);
        const value = text(format(item.value));
        const height = pdf.heightOfString(`${label}${value}`, { width: half - 8 });
        used = Math.max(used, height);
        pdf.fillColor(COLORS.muted).text(label, left + column * half, y, { width: half - 8, continued: true });
        setFont(true, 9);
        pdf.fillColor(COLORS.ink).text(value, { width: half - 8 });
      });
      pdf.y = y + used + 2;
    }
    pdf.moveDown(0.4);
  }

  // ----- Tables
  const columnWidths = (columns: ReportColumn[], section: ReportSection): number[] => {
    const maxWidth = usableWidth();
    const wanted = columns.map((column) => {
      setFont(true, FONT_SIZE);
      let width = pdf.widthOfString(text(column.label));
      setFont(false, FONT_SIZE);
      for (const row of section.rows) {
        width = Math.max(width, pdf.widthOfString(text(format(row[column.key] ?? null))));
      }
      return Math.min(width + CELL_PADDING_X * 2 + 2, maxWidth * 0.4);
    });
    const total = wanted.reduce((sum, width) => sum + width, 0);
    // Scale to the page width: shrink when too wide, spread the spare room when narrower.
    return wanted.map((width) => (width / total) * maxWidth);
  };

  const drawHeaderRow = (columns: ReportColumn[], widths: number[]): void => {
    setFont(true, FONT_SIZE);
    const height = Math.max(...columns.map((column, i) => pdf.heightOfString(text(column.label), { width: widths[i] - CELL_PADDING_X * 2 }))) + CELL_PADDING_Y * 2;
    const y = pdf.y;
    pdf.rect(left, y, usableWidth(), height).fill(COLORS.headerFill);
    let x = left;
    columns.forEach((column, i) => {
      pdf.fillColor(COLORS.headerText).text(text(column.label), x + CELL_PADDING_X, y + CELL_PADDING_Y, {
        width: widths[i] - CELL_PADDING_X * 2,
        align: column.align ?? 'left',
      });
      x += widths[i];
    });
    pdf.y = y + height;
  };

  for (const section of document.sections) {
    if (pdf.y + 60 > bottomLimit()) pdf.addPage();
    if (section.heading) {
      setFont(true, 12);
      pdf.fillColor(COLORS.ink).text(text(section.heading), left, pdf.y, { width: usableWidth() });
      pdf.moveDown(0.3);
    }

    if (section.rows.length === 0) {
      setFont(false, 9);
      pdf.fillColor(COLORS.muted).text(text(section.emptyMessage), left, pdf.y, { width: usableWidth() });
      pdf.moveDown(0.8);
      continue;
    }

    const widths = columnWidths(section.columns, section);
    drawHeaderRow(section.columns, widths);

    section.rows.forEach((row, rowIndex) => {
      setFont(false, FONT_SIZE);
      const cells = section.columns.map((column) => text(format(row[column.key] ?? null)));
      const height = Math.max(...cells.map((value, i) => pdf.heightOfString(value, { width: widths[i] - CELL_PADDING_X * 2 }))) + CELL_PADDING_Y * 2;

      if (pdf.y + height > bottomLimit()) {
        pdf.addPage();
        drawHeaderRow(section.columns, widths);
        setFont(false, FONT_SIZE);
      }

      const y = pdf.y;
      if (rowIndex % 2 === 1) pdf.rect(left, y, usableWidth(), height).fill(COLORS.zebra);
      let x = left;
      section.columns.forEach((column, i) => {
        pdf.fillColor(COLORS.ink).text(cells[i], x + CELL_PADDING_X, y + CELL_PADDING_Y, {
          width: widths[i] - CELL_PADDING_X * 2,
          align: column.align ?? 'left',
        });
        x += widths[i];
      });
      pdf.moveTo(left, y + height).lineTo(left + usableWidth(), y + height).lineWidth(0.4).strokeColor(COLORS.rule).stroke();
      pdf.y = y + height;
    });
    pdf.moveDown(1);
  }

  // ----- Notes
  if (document.notes.length > 0) {
    if (pdf.y + 40 > bottomLimit()) pdf.addPage();
    setFont(false, 8);
    for (const note of document.notes) {
      pdf.fillColor(COLORS.muted).text(text(`Note: ${note}`), left, pdf.y, { width: usableWidth() });
    }
  }

  // ----- Footer with page numbers (drawn last, when the page count is known)
  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    const savedBottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0; // allow writing inside the bottom margin without starting a new page
    setFont(false, 8);
    pdf.fillColor(COLORS.muted).text(text(`CLASSHUB  |  ${document.className}`), left, pdf.page.height - MARGIN + 6, {
      width: usableWidth() / 2,
      align: 'left',
      lineBreak: false,
    });
    pdf.text(`Page ${index - range.start + 1} of ${range.count}`, left + usableWidth() / 2, pdf.page.height - MARGIN + 6, {
      width: usableWidth() / 2,
      align: 'right',
      lineBreak: false,
    });
    pdf.page.margins.bottom = savedBottom;
  }

  pdf.end();
  return finished;
}
