import { Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { loadAppConfig } from '../config/app.config';
import { FilesService } from '../files/files.service';
import { FileCategory } from '../files/types/file.types.interface';
import { ReportDataService } from './report-data.service';
import { renderCsv } from './renderers/csv.renderer';
import { PdfFonts, renderPdf } from './renderers/pdf.renderer';
import { GeneratedReportFile, ReportDocument, ReportFormat } from './types/report.types.interface';

export interface ReportRequest {
  document: ReportDocument;
  format: ReportFormat;
  actor: AuthenticatedUser;
}

/**
 * Turns a built report into what the caller asked for: the document itself (JSON, for the screen),
 * or a CSV / PDF download. Downloads made by staff are also kept in local storage and recorded in
 * the audit log; a student's own report is generated on the fly and not stored.
 */
@Injectable()
export class ReportsService {
  private readonly fonts: PdfFonts;

  constructor(
    private readonly data: ReportDataService,
    private readonly files: FilesService,
    private readonly audit: AuditLogsService,
    config: ConfigService,
  ) {
    const app = loadAppConfig(config);
    this.fonts = { regular: app.pdfFontRegular, bold: app.pdfFontBold };
  }

  get builders(): ReportDataService {
    return this.data;
  }

  async deliver({ document, format, actor }: ReportRequest): Promise<ReportDocument | StreamableFile> {
    if (format === ReportFormat.JSON) {
      return document;
    }

    const file = await this.render(document, format);

    if (actor.role !== Role.STUDENT) {
      await this.files.saveGenerated({
        buffer: file.buffer,
        originalName: file.fileName,
        category: FileCategory.REPORT,
        mimeType: file.mimeType,
        uploadedById: actor.id,
      });
    }
    await this.audit.record({
      actor,
      action: AuditAction.REPORT_GENERATED,
      entityType: 'Report',
      entityId: null,
      summary: `Generated "${document.title}" as ${format.toUpperCase()}`,
      details: { format, rows: document.sections.reduce((sum, section) => sum + section.rows.length, 0) },
    });

    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      length: file.buffer.length,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }

  private async render(document: ReportDocument, format: ReportFormat): Promise<GeneratedReportFile> {
    const stamp = document.generatedAt.toISOString().slice(0, 10);
    if (format === ReportFormat.CSV) {
      return { buffer: renderCsv(document), mimeType: 'text/csv', fileName: `${document.fileStem}-${stamp}.csv` };
    }
    return { buffer: await renderPdf(document, this.fonts), mimeType: 'application/pdf', fileName: `${document.fileStem}-${stamp}.pdf` };
  }
}
