import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DownloadButton } from '@/components/download-button';
import { PenGrade, PenScore } from '@/components/pen-mark';
import { Section } from '@/components/page-header';
import { QueryState, RowsSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { get } from '@/lib/api';
import { formatDate, formatPercent, formatScore, humanize, ordinal } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import type { MyResultDetail } from './types';

export default function MyResultView() {
  const { examinationId = '' } = useParams();
  const query = useQuery({ queryKey: [...keys.results, 'mine', examinationId], queryFn: () => get<MyResultDetail>(`/results/my/${examinationId}`) });

  return (
    <>
      <Link to="/results" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" /> All my results
      </Link>
      <QueryState query={query} skeleton={<RowsSkeleton rows={5} />}>
        {(result) => (
          <>
            <section className="ruled margin-line mb-9 rounded-xl border border-border bg-surface py-6 pl-14 pr-5 sm:pl-16">
              <h1 className="text-[1.75rem] sm:text-[2.1rem]">{result.examinationName}</h1>
              <p className="mt-1 text-muted-foreground">
                {humanize(result.examinationType)} on {formatDate(result.examDate)}
                {result.academicPeriod ? `, ${result.academicPeriod}` : ''}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-5">
                <PenGrade grade={result.grade} size="lg" />
                <div>
                  <PenScore score={result.totalScore} max={result.totalMax} size="lg" />
                  <p className="mt-2.5 text-[0.9375rem]">
                    {formatPercent(result.percentage)} overall
                    {result.gradeRemark ? <span className="text-muted-foreground">, {result.gradeRemark}</span> : null}
                  </p>
                </div>
              </div>
              <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.9375rem]">
                <span>
                  Position <span className="font-semibold">{ordinal(result.rank)}</span> of {result.classSize}
                </span>
                {result.isPassing === true ? <Badge tone="success">Pass</Badge> : result.isPassing === false ? <Badge tone="danger">Below the pass mark</Badge> : null}
              </p>
            </section>

            <Section title="Subject by subject">
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH className="text-right">Score</TH>
                    <TH className="w-48">Percent</TH>
                    <TH className="text-center">Grade</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.subjects.map((subject) => (
                    <TR key={subject.subjectId}>
                      <TD className="font-medium">{subject.subjectName}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {subject.isAbsent ? 'Absent' : `${formatScore(subject.score)} / ${formatScore(subject.maxMarks)}`}
                      </TD>
                      <TD>
                        {subject.percentage === null ? (
                          <span className="text-muted-foreground">{subject.isAbsent ? 'Counted as 0' : '-'}</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle" role="presentation">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Math.max(subject.percentage, 0), 100)}%` }} />
                            </div>
                            <span className="w-14 text-right text-[0.8125rem] tabular-nums">{formatPercent(subject.percentage)}</span>
                          </div>
                        )}
                      </TD>
                      <TD className="text-center">
                        <PenGrade grade={subject.grade} size="sm" />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <p className="mt-3 text-sm text-muted-foreground">A subject you were absent for counts as 0 in your total.</p>
            </Section>

            <DownloadButton url="/reports/my-performance" params={{ format: 'pdf' }} fallbackName="my-performance.pdf">
              Download my report (PDF)
            </DownloadButton>
          </>
        )}
      </QueryState>
    </>
  );
}
