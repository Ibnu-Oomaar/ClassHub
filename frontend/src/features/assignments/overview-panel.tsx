import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { GradeSubmissionDialog } from '@/features/submissions/grade-submission-dialog';
import type { AssignmentOverview } from '@/features/submissions/types';
import { get } from '@/lib/api';
import { formatDateTime, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';

/** Everyone in the class against one assignment: who handed in, who is late, who is still missing. */
export function OverviewPanel({ assignmentId, canGrade }: { assignmentId: string; canGrade: boolean }) {
  const [opened, setOpened] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...keys.submissions, 'overview', assignmentId],
    queryFn: () => get<AssignmentOverview>(`/submissions/assignment/${assignmentId}/overview`),
  });

  return (
    <>
      <QueryState query={query} skeleton={<RowsSkeleton rows={5} />}>
        {(overview) => (
          <>
            <p className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[0.9375rem]">
              <span>
                <span className="font-semibold tabular-nums">{overview.counts.submitted}</span> of {overview.counts.students} handed in
              </span>
              <span>
                <span className="font-semibold tabular-nums">{overview.counts.graded}</span> graded
              </span>
              <span>
                <span className="font-semibold tabular-nums">{overview.counts.late}</span> late
              </span>
              <span className={overview.counts.missing > 0 ? 'text-pen' : undefined}>
                <span className="font-semibold tabular-nums">{overview.counts.missing}</span> missing
              </span>
            </p>

            {overview.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">There are no students in the class yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Student</TH>
                    <TH>Status</TH>
                    <TH>Handed in</TH>
                    <TH className="text-right">Score</TH>
                    <TH className="text-right">Work</TH>
                  </TR>
                </THead>
                <TBody>
                  {overview.rows.map((row) => (
                    <TR key={row.studentId}>
                      <TD>
                        <p className="font-medium">{row.studentName}</p>
                        <p className="text-[0.8125rem] text-muted-foreground">{row.studentCode}</p>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={row.status} />
                          {row.isLate ? <Badge tone="warning">Late</Badge> : null}
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap text-[0.8125rem]">{row.submittedAt ? formatDateTime(row.submittedAt) : '-'}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {row.score === null ? '-' : `${formatScore(row.score)} / ${formatScore(overview.maxMarks)}`}
                        {row.score !== null && !row.isReleased ? <span className="block text-xs text-muted-foreground">not released</span> : null}
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          {row.submissionId ? (
                            <Button size="sm" variant={canGrade && row.status === 'SUBMITTED' ? 'default' : 'outline'} onClick={() => setOpened(row.submissionId)}>
                              {canGrade ? (row.status === 'GRADED' ? 'Review grade' : 'Grade') : 'Open'}
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </QueryState>

      <GradeSubmissionDialog submissionId={opened} onClose={() => setOpened(null)} canGrade={canGrade} />
    </>
  );
}
