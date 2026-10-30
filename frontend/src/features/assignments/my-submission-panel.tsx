import { useQuery } from '@tanstack/react-query';
import { Pencil, Send } from 'lucide-react';
import { useState } from 'react';
import { DownloadButton } from '@/components/download-button';
import { Field } from '@/components/form-field';
import { PenScore } from '@/components/pen-mark';
import { ErrorState, RowsSkeleton, Spinner } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { UploadField, type UploadedItem } from '@/components/upload-field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import type { Submission } from '@/features/submissions/types';
import { get, patch, post } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { Assignment } from './types';

function SubmissionForm({ assignment, existing, onDone }: { assignment: Assignment; existing: Submission | null; onDone: () => void }) {
  const [text, setText] = useState(existing?.textAnswer ?? '');
  const [file, setFile] = useState<UploadedItem[]>([]);
  const [removeFile, setRemoveFile] = useState(false);
  const keepsOldFile = existing?.fileName != null && !removeFile && file.length === 0;
  const hasContent = text.trim() !== '' || file.length > 0 || keepsOldFile;

  const send = useAction({
    run: () => {
      const fileId = file[0]?.id;
      if (existing) {
        return patch<Submission>(`/submissions/${existing.id}`, {
          textAnswer: text.trim() || null,
          ...(fileId ? { fileId } : removeFile ? { fileId: null } : {}),
        });
      }
      return post<Submission>('/submissions', { assignmentId: assignment.id, textAnswer: text.trim() || null, ...(fileId ? { fileId } : {}) });
    },
    refresh: [keys.assignments, keys.submissions, keys.dashboard],
    success: existing ? 'Your work is updated.' : 'Handed in. Well done.',
    quiet: true,
    onSuccess: onDone,
  });

  return (
    <form
      noValidate
      className="max-w-2xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasContent) send.mutate();
      }}
    >
      {send.isError ? <Alert tone="danger">{send.error.message}</Alert> : null}
      <Field label="Your answer" htmlFor="my-answer" hint="Type your answer here, attach a file, or do both.">
        <Textarea id="my-answer" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">File</p>
        {existing?.fileName && !removeFile && file.length === 0 ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{existing.fileName}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveFile(true)}>
              Remove
            </Button>
          </div>
        ) : null}
        <UploadField category="SUBMISSION" items={file} onChange={setFile} max={1} label={existing?.fileName ? 'Replace the file' : 'Attach a file'} hint="PDF, Office, text, image or ZIP." />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!hasContent || send.isPending}>
          {send.isPending ? <Spinner /> : <Send />}
          {existing ? 'Save changes' : 'Hand in'}
        </Button>
        {existing ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={send.isPending}>
            Cancel
          </Button>
        ) : null}
      </div>
      {!hasContent ? <p className="text-[0.8125rem] text-muted-foreground">Write an answer or attach a file first.</p> : null}
    </form>
  );
}

/** What the signed-in student does with one assignment: hand work in, change it before it is graded, and read the grade. */
export function MySubmissionPanel({ assignment }: { assignment: Assignment }) {
  const mine = assignment.mySubmission;
  const [editing, setEditing] = useState(false);
  const submission = useQuery({
    queryKey: [...keys.submissions, 'one', mine?.id],
    queryFn: () => get<Submission>(`/submissions/${mine?.id}`),
    enabled: Boolean(mine?.id),
  });

  if (!mine) {
    if (!assignment.acceptsSubmissions) {
      return (
        <Alert tone="warning" title="You cannot hand in work for this assignment">
          {!assignment.isAvailable
            ? 'The teacher has switched hand-ins off.'
            : assignment.state === 'CLOSED'
              ? 'The deadline has passed and late work is not accepted.'
              : 'Hand-ins are switched off for the whole class at the moment.'}
        </Alert>
      );
    }
    return (
      <>
        {assignment.state === 'OVERDUE' ? (
          <Alert tone="warning" title="The deadline has passed" className="mb-4">
            The teacher still accepts late work. It will be marked as late.
          </Alert>
        ) : null}
        <SubmissionForm assignment={assignment} existing={null} onDone={() => undefined} />
      </>
    );
  }

  if (submission.isPending) return <RowsSkeleton rows={3} />;
  if (submission.isError) return <ErrorState message={submission.error.message} onRetry={() => void submission.refetch()} />;
  const data = submission.data;

  if (editing) return <SubmissionForm assignment={assignment} existing={data} onDone={() => setEditing(false)} />;

  const canEdit = data.status === 'SUBMITTED' && assignment.acceptsSubmissions;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Handed in {formatDateTime(data.submittedAt)}</span>
        {data.isLate ? <Badge tone="warning">Late</Badge> : null}
        <StatusBadge status={data.status} />
      </p>

      {data.status === 'GRADED' && data.score !== null ? (
        <div className="ruled margin-line rounded-xl border border-border bg-surface py-5 pl-14 pr-5 sm:pl-16">
          <p className="mb-2 text-sm text-muted-foreground">Your grade</p>
          <PenScore score={data.score} max={data.maxMarks} size="lg" />
          {data.feedback ? (
            <>
              <p className="mb-1 mt-5 text-sm text-muted-foreground">Feedback from your teacher</p>
              <p className="whitespace-pre-wrap break-words">{data.feedback}</p>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Your teacher has not graded this yet.</p>
      )}

      {data.textAnswer ? (
        <div>
          <p className="mb-1.5 text-sm font-medium">Your answer</p>
          <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-subtle/40 px-4 py-3 text-[0.9375rem] leading-relaxed">{data.textAnswer}</div>
        </div>
      ) : null}
      {data.fileName ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{data.fileName}</p>
            {data.fileSizeBytes ? <p className="text-[0.8125rem] text-muted-foreground">{formatBytes(data.fileSizeBytes)}</p> : null}
          </div>
          <DownloadButton url={`/submissions/${data.id}/file`} fallbackName={data.fileName} size="sm">
            Download
          </DownloadButton>
        </div>
      ) : null}

      {canEdit ? (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Change my work
        </Button>
      ) : data.status === 'GRADED' ? null : (
        <p className="text-sm text-muted-foreground">You can no longer change this work.</p>
      )}
    </div>
  );
}
