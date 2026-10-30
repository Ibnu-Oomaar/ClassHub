export type ReportCell = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

/** One table of a report. Every row has a value (possibly null) for each column key. */
export interface ReportSection {
  heading: string | null;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Shown instead of an empty table, so the reader knows the section is empty on purpose. */
  emptyMessage: string;
}

export interface ReportSummaryItem {
  label: string;
  value: ReportCell;
}

/**
 * A finished report, independent of the output format. The same document is returned as JSON for
 * the screen and rendered to CSV or PDF for download, so all three always agree.
 */
export interface ReportDocument {
  title: string;
  subtitle: string | null;
  className: string;
  generatedAt: Date;
  summary: ReportSummaryItem[];
  sections: ReportSection[];
  /** Plain-language notes about how the numbers were calculated. */
  notes: string[];
  /** Used for the downloaded file name, e.g. "examination-results-term-1-midterm". */
  fileStem: string;
}

export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
}

export interface GeneratedReportFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}
