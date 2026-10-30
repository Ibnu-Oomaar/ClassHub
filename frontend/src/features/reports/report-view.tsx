import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReportCell, ReportDocument } from './types';

function show(value: ReportCell): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

/** The report exactly as the server built it, so the screen, the CSV and the PDF always agree. */
export function ReportView({ report }: { report: ReportDocument }) {
  return (
    <article className="rounded-xl border border-border bg-surface px-5 py-6 sm:px-8">
      <header className="border-b-2 border-border pb-4">
        <p className="text-sm text-muted-foreground">{report.className}</p>
        <h2 className="mt-0.5 text-2xl">{report.title}</h2>
        {report.subtitle ? <p className="mt-1 text-muted-foreground">{report.subtitle}</p> : null}
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">Generated {formatDateTime(report.generatedAt)}</p>
      </header>

      {report.summary.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border py-5 sm:grid-cols-3 lg:grid-cols-4">
          {report.summary.map((item) => (
            <div key={item.label}>
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 font-display text-2xl leading-tight">{show(item.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {report.sections.map((section, index) => (
        <section key={section.heading ?? index} className="pt-6">
          {section.heading ? <h3 className="mb-2 text-lg">{section.heading}</h3> : null}
          {section.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-input px-4 py-5 text-sm text-muted-foreground">{section.emptyMessage}</p>
          ) : (
            <div className="scroll-thin w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b-2 border-border">
                  <tr>
                    {section.columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          'whitespace-nowrap px-3 py-2 text-[0.8125rem] font-semibold text-muted-foreground',
                          column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left',
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border last:border-0">
                      {section.columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn('px-3 py-2.5 align-top', column.align === 'right' ? 'text-right tabular-nums' : column.align === 'center' ? 'text-center' : 'text-left')}
                        >
                          {show(row[column.key] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {report.notes.length > 0 ? (
        <footer className="mt-6 border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium">How these numbers are worked out</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[0.8125rem] text-muted-foreground">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </footer>
      ) : null}
    </article>
  );
}
