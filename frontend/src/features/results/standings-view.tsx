import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronRight, EyeOff, Send } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DownloadButton } from '@/components/download-button';
import { PenGrade } from '@/components/pen-mark';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { get, post } from '@/lib/api';
import { formatDateTime, formatPercent, formatScore, pluralize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { ExaminationStandings, PublishOutcome } from './types';

export default function StandingsView() {
  const { examinationId = '' } = useParams();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const query = useQuery({
    queryKey: [...keys.results, 'standings', examinationId],
    queryFn: () => get<ExaminationStandings>(`/results/examination/${examinationId}/standings`),
  });

  const refresh = [keys.results, keys.examinations, keys.dashboard];
  const publish = useAction({
    run: () => post<PublishOutcome>('/results/publish', { examinationId }),
    refresh,
    success: (outcome) => `Published. ${pluralize(outcome.students, 'student')} can now see their results.`,
    onSuccess: (outcome) => {
      setWarnings(outcome.warnings);
      setPublishing(false);
    },
  });
  const unpublish = useAction({
    run: () => post<PublishOutcome>('/results/unpublish', { examinationId }),
    refresh,
    success: 'The results are hidden from students again.',
    onSuccess: () => {
      setWarnings([]);
      setUnpublishing(false);
    },
  });

  const toggle = (studentId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  return (
    <>
      <Link to="/results" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" /> All results
      </Link>

      <QueryState query={query} skeleton={<RowsSkeleton rows={6} />}>
        {(standings) => (
          <>
            <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-[1.75rem] sm:text-[2.1rem]">{standings.examinationName}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground">
                  {standings.published ? <Badge tone="success">Published {formatDateTime(standings.publishedAt)}</Badge> : <Badge>Not published</Badge>}
                  <span>
                    {standings.subjectsApproved} of {pluralize(standings.subjectsTotal, 'subject')} approved
                  </span>
                  <span>{pluralize(standings.classSize, 'student')} in the class</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <DownloadButton url="/reports/examination-results" params={{ examinationId, format: 'pdf' }} fallbackName="examination-results.pdf">
                  PDF
                </DownloadButton>
                <DownloadButton url="/reports/examination-results" params={{ examinationId, format: 'csv' }} fallbackName="examination-results.csv">
                  CSV
                </DownloadButton>
                {standings.published ? (
                  <Button variant="outline" onClick={() => setUnpublishing(true)}>
                    <EyeOff /> Unpublish
                  </Button>
                ) : (
                  <Button disabled={!standings.readyToPublish} onClick={() => setPublishing(true)}>
                    <Send /> Publish results
                  </Button>
                )}
              </div>
            </header>

            {!standings.published && standings.blockers.length > 0 ? (
              <Alert tone="warning" title="These results cannot be published yet" className="mb-5">
                <ul className="list-disc space-y-0.5 pl-5">
                  {standings.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {!standings.published && standings.readyToPublish ? (
              <Alert tone="success" title="Ready to publish" className="mb-5">
                Every subject is approved. Below are the standings students will see. Publishing freezes totals, grades and positions.
              </Alert>
            ) : null}
            {warnings.length > 0 ? (
              <Alert tone="warning" title="Check these students" className="mb-5">
                <ul className="list-disc space-y-0.5 pl-5">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {standings.rows.length === 0 ? (
              <EmptyState title="No standings yet" description="Standings appear once marks are approved. Students with no marks in any approved subject are not ranked." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10" />
                    <TH className="w-16">Position</TH>
                    <TH>Student</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Percent</TH>
                    <TH className="text-center">Grade</TH>
                    <TH>Result</TH>
                  </TR>
                </THead>
                <TBody>
                  {standings.rows.map((row) => {
                    const expanded = open.has(row.studentId);
                    return (
                      <Fragment key={row.studentId}>
                        <TR>
                          <TD>
                            <Button variant="ghost" size="icon-sm" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} subjects of ${row.studentName}`} onClick={() => toggle(row.studentId)}>
                              {expanded ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                          </TD>
                          <TD className="font-display text-lg tabular-nums">{row.rank}</TD>
                          <TD>
                            <p className="font-medium">{row.studentName}</p>
                            <p className="text-[0.8125rem] text-muted-foreground">{row.studentCode}</p>
                          </TD>
                          <TD className="whitespace-nowrap text-right tabular-nums">
                            {formatScore(row.totalScore)} / {formatScore(row.totalMax)}
                          </TD>
                          <TD className="text-right tabular-nums">{formatPercent(row.percentage)}</TD>
                          <TD className="text-center">
                            <PenGrade grade={row.grade} size="sm" />
                          </TD>
                          <TD>{row.isPassing === null ? '-' : row.isPassing ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Fail</Badge>}</TD>
                        </TR>
                        {expanded ? (
                          <TR className="bg-subtle/40 hover:bg-subtle/40">
                            <TD />
                            <TD colSpan={6}>
                              <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 py-1 sm:grid-cols-2 lg:grid-cols-3">
                                {row.subjects.map((subject) => (
                                  <li key={subject.subjectId} className="flex items-baseline justify-between gap-3 text-sm">
                                    <span>{subject.subjectName}</span>
                                    <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                                      {subject.isAbsent ? 'Absent' : `${formatScore(subject.score)} / ${formatScore(subject.maxMarks)}`}
                                      {subject.grade ? <span className="ml-2 font-medium text-foreground">{subject.grade}</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </TD>
                          </TR>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TBody>
              </Table>
            )}

            <p className="mt-4 max-w-prose text-sm text-muted-foreground">
              Students tied on the same percentage share a position and the next position is skipped. A subject a student was absent for counts as 0.
            </p>

            <ConfirmDialog
              open={publishing}
              onOpenChange={setPublishing}
              title="Publish these results?"
              description={`${pluralize(standings.rows.length, 'student')} will see their own marks, grade and position. Totals, grades and positions are frozen at this moment. You can unpublish to make corrections.`}
              confirmLabel="Publish results"
              pending={publish.isPending}
              onConfirm={() => publish.mutate()}
            />
            <ConfirmDialog
              open={unpublishing}
              onOpenChange={setUnpublishing}
              title="Hide these results from students?"
              description="Students stop seeing this examination. Marks stay approved, and you can publish again at any time."
              confirmLabel="Unpublish"
              pending={unpublish.isPending}
              onConfirm={() => unpublish.mutate()}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
