import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PenGrade } from '@/components/pen-mark';
import { EmptyState, QueryState, RowsSkeleton, Spinner } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { gradeFor } from '@/features/grading/types';
import { useActiveScale } from '@/features/grading/use-active-scale';
import { get, post, put } from '@/lib/api';
import { formatDate, formatDateTime, formatPercent, formatScore, pluralize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { ReviewActions } from './review-actions';
import { MarksImportPanel } from './marks-import-panel';
import type { MarkEntry, MarkSheet } from './types';

interface Draft {
  score: string;
  absent: boolean;
  remarks: string;
}

function toDraft(entry: MarkEntry): Draft {
  return { score: entry.score === null ? '' : formatScore(entry.score), absent: entry.isAbsent, remarks: entry.remarks ?? '' };
}

function isDirty(entry: MarkEntry, draft: Draft): boolean {
  const original = toDraft(entry);
  return original.score !== draft.score.trim() || original.absent !== draft.absent || original.remarks !== draft.remarks.trim();
}

/** Returns the score as a number, null when empty, or a message when the text cannot be a score. */
function readScore(text: string, max: number): { value: number | null; problem?: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: null, problem: 'Enter a number.' };
  if (value < 0) return { value: null, problem: 'A score cannot be negative.' };
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return { value: null, problem: 'At most 2 decimals.' };
  if (Math.round(value * 100) > Math.round(max * 100)) return { value: null, problem: `Above the maximum of ${formatScore(max)}.` };
  return { value };
}

export default function MarksSheetPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const isTeacher = me.role === 'TEACHER';
  const scale = useActiveScale();
  const query = useQuery({ queryKey: [...keys.marks, 'sheet', id], queryFn: () => get<MarkSheet>(`/marks/examination-subjects/${id}`) });

  return (
    <>
      <Link
        to={query.data ? `/examinations/${query.data.examinationId}` : '/examinations'}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> {query.data ? query.data.examinationName : 'Examinations'}
      </Link>
      <QueryState query={query} skeleton={<RowsSkeleton rows={8} />}>
        {(sheet) => <Sheet sheet={sheet} editableByMe={isTeacher && sheet.canEdit} bands={scale.data?.bands ?? null} />}
      </QueryState>
    </>
  );
}

function Sheet({ sheet, editableByMe, bands }: { sheet: MarkSheet; editableByMe: boolean; bands: { grade: string; minMark: number; maxMark: number; remark: string | null; isPassing: boolean }[] | null }) {
  const me = useMe();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(sheet.entries.map((entry) => [entry.studentId, toDraft(entry)])));
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Whenever the server's copy changes (after a save, a submit or a review) the drafts start again from it.
  useEffect(() => {
    setDrafts(Object.fromEntries(sheet.entries.map((entry) => [entry.studentId, toDraft(entry)])));
  }, [sheet]);

  const rows = useMemo(
    () =>
      sheet.entries.map((entry) => {
        const draft = drafts[entry.studentId] ?? toDraft(entry);
        const read = draft.absent ? { value: null } : readScore(draft.score, sheet.maxMarks);
        const percentage = read.value === null ? null : Math.round((Math.round(read.value * 100) / Math.round(sheet.maxMarks * 100)) * 10000) / 100;
        const band = read.value !== null && bands ? gradeFor(read.value, bands) : null;
        const grade = sheet.resultsPublished ? entry.grade : band?.grade ?? null;
        return { entry, draft, problem: 'problem' in read ? read.problem : undefined, value: read.value, percentage, grade, dirty: isDirty(entry, draft) };
      }),
    [sheet, drafts, bands],
  );

  const dirtyRows = rows.filter((row) => row.dirty);
  const hasProblem = rows.some((row) => row.problem);
  const complete = rows.filter((row) => row.draft.absent || row.draft.score.trim() !== '').length;

  const refresh = [keys.marks, keys.examinations, keys.dashboard];
  const payload = () => ({
    entries: dirtyRows.map((row) => ({
      studentId: row.entry.studentId,
      score: row.draft.absent ? null : row.value,
      isAbsent: row.draft.absent,
      remarks: row.draft.remarks.trim() || null,
    })),
  });

  const save = useAction({
    run: () => put<MarkSheet>(`/marks/examination-subjects/${sheet.examinationSubjectId}`, payload()),
    refresh,
    success: 'Marks saved.',
  });

  const submit = useAction({
    run: async () => {
      if (dirtyRows.length > 0) await put(`/marks/examination-subjects/${sheet.examinationSubjectId}`, payload());
      return post<MarkSheet>(`/marks/examination-subjects/${sheet.examinationSubjectId}/submit`, { confirm: true });
    },
    refresh,
    success: 'Submitted. The Class Master will review the marks.',
    onSuccess: () => setConfirmSubmit(false),
  });

  const update = (studentId: string, patch: Partial<Draft>) =>
    setDrafts((current) => {
      const base = current[studentId] ?? { score: '', absent: false, remarks: '' };
      return { ...current, [studentId]: { ...base, ...patch } };
    });

  const busy = save.isPending || submit.isPending;
  const statusNote =
    sheet.marksStatus === 'SUBMITTED'
      ? `Submitted ${formatDateTime(sheet.submittedAt)} and waiting for the Class Master.`
      : sheet.marksStatus === 'APPROVED'
        ? `Approved ${formatDateTime(sheet.reviewedAt)}.`
        : null;

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] sm:text-[2.1rem]">{sheet.subjectName}</h1>
          <p className="mt-1.5 text-muted-foreground">
            {sheet.examinationName} on {formatDate(sheet.examDate)}, marked out of <span className="font-semibold text-foreground">{formatScore(sheet.maxMarks)}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <StatusBadge status={sheet.marksStatus} />
            <span className="text-muted-foreground">
              {complete} of {pluralize(sheet.total, 'student')} marked
            </span>
            {statusNote ? <span className="text-muted-foreground">{statusNote}</span> : null}
          </div>
        </div>
        {isClassMaster ? <ReviewActions sheet={sheet} /> : null}
      </header>

      {sheet.marksStatus === 'REJECTED' && sheet.reviewFeedback ? (
        <Alert tone="danger" title="The Class Master sent these marks back" className="mb-5">
          {sheet.reviewFeedback}
        </Alert>
      ) : null}
      {sheet.resultsPublished ? (
        <Alert tone="info" title="Results are published" className="mb-5">
          These marks are part of published results, so they are locked. The Class Master can unpublish the results to allow a correction.
        </Alert>
      ) : null}
      {!sheet.gradingConfigured ? (
        <Alert tone="warning" title="No grading scale is active" className="mb-5">
          Marks can still be entered, but grades stay empty until the Class Master activates a grading scale.
        </Alert>
      ) : null}
      {isClassMaster && sheet.marksStatus !== 'SUBMITTED' && sheet.marksStatus !== 'APPROVED' ? (
        <Alert tone="info" className="mb-5">
          {sheet.marksStatus === 'REJECTED' ? 'The teacher is correcting these marks.' : 'The teacher has not submitted this sheet yet. You can only read it for now.'}
        </Alert>
      ) : null}

      {editableByMe ? (
        <MarksImportPanel
          examinationSubjectId={sheet.examinationSubjectId}
          disabled={dirtyRows.length > 0 || busy}
        />
      ) : null}

      {sheet.total === 0 ? (
        <EmptyState title="There are no students in the class yet" description="Add students first. Every student of the class gets a row on the mark sheet." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Student</TH>
              <TH className="w-36">Score</TH>
              <TH className="w-24">Absent</TH>
              <TH className="w-24 text-right">Percent</TH>
              <TH className="w-20 text-center">Grade</TH>
              <TH className="min-w-48">Remark</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row, index) => (
              <TR key={row.entry.studentId} className={cn(row.dirty && 'bg-highlight/15')}>
                <TD className="tabular-nums text-muted-foreground">{index + 1}</TD>
                <TD>
                  <p className="font-medium">{row.entry.studentName}</p>
                  <p className="text-[0.8125rem] text-muted-foreground">{row.entry.studentCode}</p>
                </TD>
                <TD>
                  {editableByMe ? (
                    <>
                      <Input
                        ref={(element) => {
                          inputs.current[index] = element;
                        }}
                        inputMode="decimal"
                        value={row.draft.absent ? '' : row.draft.score}
                        disabled={row.draft.absent || busy}
                        onChange={(event) => update(row.entry.studentId, { score: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            inputs.current[index + 1]?.focus();
                          }
                        }}
                        aria-label={`Score for ${row.entry.studentName}`}
                        aria-invalid={!!row.problem}
                        aria-describedby={row.problem ? `problem-${row.entry.studentId}` : undefined}
                        className="h-9 text-right tabular-nums"
                      />
                      {row.problem ? (
                        <p id={`problem-${row.entry.studentId}`} role="alert" className="mt-1 text-xs font-medium text-pen">
                          {row.problem}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <span className="block text-right tabular-nums">{row.entry.isAbsent ? 'Absent' : row.entry.score === null ? '-' : formatScore(row.entry.score)}</span>
                  )}
                </TD>
                <TD>
                  {editableByMe ? (
                    <Checkbox
                      checked={row.draft.absent}
                      disabled={busy}
                      onCheckedChange={(checked) => update(row.entry.studentId, { absent: checked === true, ...(checked === true ? { score: '' } : {}) })}
                      aria-label={`${row.entry.studentName} was absent`}
                    />
                  ) : (
                    <span className="text-muted-foreground">{row.entry.isAbsent ? 'Yes' : ''}</span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{row.percentage === null ? '-' : formatPercent(row.percentage)}</TD>
                <TD className="text-center">
                  <PenGrade grade={row.grade} size="sm" />
                </TD>
                <TD>
                  {editableByMe ? (
                    <Input
                      value={row.draft.remarks}
                      maxLength={255}
                      disabled={busy}
                      onChange={(event) => update(row.entry.studentId, { remarks: event.target.value })}
                      aria-label={`Remark for ${row.entry.studentName}`}
                      className="h-9"
                    />
                  ) : (
                    <span className="text-muted-foreground">{row.entry.remarks ?? ''}</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {editableByMe && sheet.total > 0 ? (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {hasProblem
                ? 'Fix the highlighted scores before saving.'
                : dirtyRows.length > 0
                  ? `${pluralize(dirtyRows.length, 'change')} not saved yet.`
                  : 'Everything is saved.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={dirtyRows.length === 0 || hasProblem || busy} onClick={() => save.mutate()}>
                {save.isPending ? <Spinner /> : <Save />}
                Save draft
              </Button>
              <Button disabled={hasProblem || busy || complete < sheet.total} onClick={() => setConfirmSubmit(true)}>
                <Send /> Submit for review
              </Button>
            </div>
          </div>
          {complete < sheet.total ? (
            <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">Enter a score or mark absent for all {sheet.total} students to submit.</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit these marks?"
        description="The sheet is locked while the Class Master reviews it. If it is sent back you can correct it and submit again."
        confirmLabel="Submit marks"
        pending={submit.isPending}
        onConfirm={() => submit.mutate()}
      />
    </>
  );
}
