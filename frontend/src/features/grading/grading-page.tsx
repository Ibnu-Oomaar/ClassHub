import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Percent, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { PenGrade } from '@/components/pen-mark';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { del, getPage, post } from '@/lib/api';
import { formatRelative, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { GradingScaleDialog } from './grading-scale-dialog';
import type { GradingScale } from './types';

export default function GradingPage() {
  const [editing, setEditing] = useState<GradingScale | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<GradingScale | null>(null);

  const query = useQuery({
    queryKey: [...keys.grading, 'list'],
    queryFn: async () => (await getPage<GradingScale>('/grading', { limit: 100 })).items,
  });

  const refresh = [keys.grading, keys.marks, keys.results, keys.dashboard];
  const activate = useAction({
    run: (scale: GradingScale) => post(`/grading/${scale.id}/activate`),
    refresh,
    success: (_data, scale) => `${scale.name} is now the grading scale.`,
  });
  const remove = useAction({
    run: (scale: GradingScale) => del(`/grading/${scale.id}`),
    refresh,
    success: 'The scale is deleted.',
    onSuccess: () => setRemoving(null),
  });

  const openForm = (scale: GradingScale | null) => {
    setEditing(scale);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Grading scales"
        description="Set the maximum marks and actual-mark ranges your school uses for each grade."
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus /> New scale
          </Button>
        }
      />

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={3} />}
        isEmpty={(scales) => scales.length === 0}
        empty={
          <EmptyState
            icon={<Percent />}
            title="No grading scale yet"
            description="Without a grading scale, marks are recorded but no grade is shown. Create the scale your school uses and activate it."
            action={
              <Button onClick={() => openForm(null)}>
                <Plus /> Create the first scale
              </Button>
            }
          />
        }
      >
        {(scales) => (
          <>
            {!scales.some((scale) => scale.isActive) ? (
              <Alert tone="warning" title="No scale is active" className="mb-6">
                Activate one of the scales below so marks turn into grades and results can be published.
              </Alert>
            ) : null}
            <div className="space-y-8">
              {scales.map((scale) => {
                const bands = [...scale.bands].sort((a, b) => b.minMark - a.minMark);
                return (
                  <section key={scale.id} aria-labelledby={`scale-${scale.id}`}>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b-2 border-border pb-3">
                      <div className="min-w-0">
                        <h2 id={`scale-${scale.id}`} className="flex flex-wrap items-center gap-2 text-xl">
                          {scale.name}
                          {scale.isActive ? <Badge tone="success">In use</Badge> : null}
                        </h2>
                        {scale.description ? <p className="mt-0.5 text-sm text-muted-foreground">{scale.description}</p> : null}
                        <p className="mt-0.5 text-sm text-muted-foreground">Maximum marks: {formatScore(scale.maxMark)}</p>
                        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">Updated {formatRelative(scale.updatedAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!scale.isActive ? (
                          <Button variant="outline" size="sm" disabled={activate.isPending} onClick={() => activate.mutate(scale)}>
                            <CheckCircle2 /> Use this scale
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => openForm(scale)}>
                          <Pencil /> Edit
                        </Button>
                        {!scale.isActive ? (
                          <Button variant="outline" size="sm" onClick={() => setRemoving(scale)}>
                            <Trash2 className="text-pen" /> Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-24">Grade</TH>
                          <TH>Minimum mark</TH>
                          <TH>Maximum mark</TH>
                          <TH>Remark</TH>
                          <TH>Counts as</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {bands.map((band) => (
                          <TR key={band.id}>
                            <TD>
                              <PenGrade grade={band.grade} size="sm" />
                            </TD>
                            <TD className="tabular-nums">{formatScore(band.minMark)}</TD>
                            <TD className="tabular-nums">{formatScore(band.maxMark)}</TD>
                            <TD>{band.remark ?? '-'}</TD>
                            <TD>{band.isPassing ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Fail</Badge>}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </QueryState>

      <GradingScaleDialog open={formOpen} onOpenChange={setFormOpen} scale={editing} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete ${removing?.name ?? 'scale'}?`}
        description="This only removes the scale. Marks and published results are not affected."
        confirmLabel="Delete scale"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}
