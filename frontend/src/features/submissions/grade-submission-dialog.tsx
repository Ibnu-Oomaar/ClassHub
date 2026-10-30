import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DownloadButton } from '@/components/download-button';
import { Field } from '@/components/form-field';
import { ErrorState, Spinner } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { get, post } from '@/lib/api';
import { formatBytes, formatDateTime, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { Submission } from './types';

const schema = z.object({
  score: z
    .string()
    .trim()
    .min(1, 'Enter the score.')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, 'Enter a number, 0 or more.')
    .refine((value) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-6, 'At most 2 decimals.'),
  feedback: z.string().trim().max(4000, 'Use at most 4000 characters.'),
  release: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** A submission opened by staff. The teacher of the subject can grade it; the Class Master can only read it. */
export function GradeSubmissionDialog({
  submissionId,
  onClose,
  canGrade,
}: {
  submissionId: string | null;
  onClose: () => void;
  canGrade: boolean;
}) {
  const query = useQuery({
    queryKey: [...keys.submissions, 'one', submissionId],
    queryFn: () => get<Submission>(`/submissions/${submissionId}`),
    enabled: submissionId !== null,
  });
  const submission = query.data;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { score: '', feedback: '', release: true } });

  useEffect(() => {
    if (submission) {
      reset({ score: submission.score === null ? '' : formatScore(submission.score), feedback: submission.feedback ?? '', release: true });
    }
  }, [submission, reset]);

  const grade = useAction({
    run: (values: Values) => {
      if (submission && Math.round(Number(values.score) * 100) > Math.round(submission.maxMarks * 100)) {
        throw new Error(`The score is above the maximum of ${formatScore(submission.maxMarks)}.`);
      }
      return post<Submission>(`/submissions/${submissionId}/grade`, { score: Number(values.score), feedback: values.feedback || null, release: values.release });
    },
    refresh: [keys.submissions, keys.assignments, keys.dashboard],
    success: (saved) => (saved.isReleased ? `Graded. ${saved.studentName} can see the grade.` : 'Grade saved. The student cannot see it until you release it.'),
    quiet: true,
    onSuccess: onClose,
  });

  return (
    <Dialog open={submissionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={handleSubmit((values) => grade.mutate(values))}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{submission ? submission.studentName : 'Submission'}</DialogTitle>
            <DialogDescription>
              {submission ? `${submission.assignmentTitle}, ${submission.subjectName}` : 'Loading the submission'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {query.isPending ? (
              <div className="grid place-items-center py-16" role="status" aria-label="Loading">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : query.isError ? (
              <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
            ) : submission ? (
              <>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Handed in {formatDateTime(submission.submittedAt)}</span>
                  {submission.isLate ? <Badge tone="warning">Late</Badge> : null}
                  <StatusBadge status={submission.status} />
                </p>

                {submission.textAnswer ? (
                  <div>
                    <p className="mb-1.5 text-sm font-medium">Answer</p>
                    <div className="scroll-thin max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-subtle/40 px-4 py-3 text-[0.9375rem] leading-relaxed">
                      {submission.textAnswer}
                    </div>
                  </div>
                ) : null}
                {submission.fileName ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{submission.fileName}</p>
                      {submission.fileSizeBytes ? <p className="text-[0.8125rem] text-muted-foreground">{formatBytes(submission.fileSizeBytes)}</p> : null}
                    </div>
                    <DownloadButton url={`/submissions/${submission.id}/file`} fallbackName={submission.fileName} size="sm">
                      Download
                    </DownloadButton>
                  </div>
                ) : null}
                {!submission.textAnswer && !submission.fileName ? <p className="text-sm text-muted-foreground">The student handed in nothing to read.</p> : null}

                {canGrade ? (
                  <div className="space-y-4 border-t border-border pt-4">
                    {grade.isError ? <Alert tone="danger">{grade.error.message}</Alert> : null}
                    <Field label={`Score out of ${formatScore(submission.maxMarks)}`} htmlFor="grade-score" error={errors.score?.message} required>
                      <Input
                        id="grade-score"
                        inputMode="decimal"
                        autoFocus
                        className="w-40 tabular-nums"
                        aria-invalid={!!errors.score}
                        {...register('score')}
                      />
                    </Field>
                    <Field label="Feedback" htmlFor="grade-feedback" error={errors.feedback?.message} hint="The student reads this once the grade is released.">
                      <Textarea id="grade-feedback" rows={4} aria-invalid={!!errors.feedback} {...register('feedback')} />
                    </Field>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                      <div>
                        <p className="font-medium">Show the grade to the student</p>
                        <p className="text-sm text-muted-foreground">Turn off to save the grade now and release it later.</p>
                      </div>
                      <Switch checked={watch('release')} onCheckedChange={(checked) => setValue('release', checked)} aria-label="Show the grade to the student" />
                    </div>
                  </div>
                ) : submission.score !== null ? (
                  <p className="border-t border-border pt-4 text-[0.9375rem]">
                    Score <span className="font-semibold">{formatScore(submission.score)}</span> out of {formatScore(submission.maxMarks)}
                    {submission.isReleased ? ', shown to the student.' : ', not released to the student yet.'}
                  </p>
                ) : null}
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={grade.isPending}>
              {canGrade ? 'Cancel' : 'Close'}
            </Button>
            {canGrade ? (
              <Button type="submit" disabled={grade.isPending || !submission}>
                {grade.isPending ? <Spinner /> : null}
                {submission && submission.score !== null ? 'Update grade' : 'Save grade'}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
