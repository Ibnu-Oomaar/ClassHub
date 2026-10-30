import { Check, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { MarkSheet } from './types';

/** The Class Master's decision on a submitted mark sheet: approve it, or send it back with a reason. */
export function ReviewActions({ sheet }: { sheet: MarkSheet }) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refresh = [keys.marks, keys.examinations, keys.results, keys.dashboard];
  const approve = useAction({
    run: () => post(`/marks/examination-subjects/${sheet.examinationSubjectId}/review`, { decision: 'APPROVE' }),
    refresh,
    success: `${sheet.subjectName} marks are approved.`,
    onSuccess: () => setApproving(false),
  });
  const reject = useAction({
    run: () => post(`/marks/examination-subjects/${sheet.examinationSubjectId}/review`, { decision: 'REJECT', feedback: feedback.trim() }),
    refresh,
    success: 'The marks are sent back to the teacher.',
    quiet: true,
    onSuccess: () => {
      setRejecting(false);
      setFeedback('');
    },
  });

  const canApprove = sheet.marksStatus === 'SUBMITTED';
  const canReject = sheet.marksStatus === 'SUBMITTED' || sheet.marksStatus === 'APPROVED';
  if (!canApprove && !canReject) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <Button onClick={() => setApproving(true)}>
            <Check /> Approve marks
          </Button>
        ) : null}
        {canReject ? (
          <Button variant="outline" onClick={() => setRejecting(true)}>
            <Undo2 /> Send back to teacher
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={approving}
        onOpenChange={setApproving}
        title="Approve these marks?"
        description={`${sheet.subjectName} for ${sheet.examinationName}: ${sheet.total} students. Once every subject is approved you can publish the results.`}
        confirmLabel="Approve marks"
        pending={approve.isPending}
        onConfirm={() => approve.mutate()}
      />

      <Dialog
        open={rejecting}
        onOpenChange={(open) => {
          setRejecting(open);
          if (!open) reject.reset();
        }}
      >
        <DialogContent size="sm">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (feedback.trim()) reject.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Send the marks back</DialogTitle>
              <DialogDescription>The teacher can correct the sheet and submit it again. Tell them what to fix.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3 pb-2">
              {reject.isError ? <Alert tone="danger">{reject.error.message}</Alert> : null}
              {sheet.marksStatus === 'APPROVED' ? (
                <Alert tone="warning">These marks are already approved. Sending them back puts the examination out of "ready to publish".</Alert>
              ) : null}
              <Field label="What must the teacher correct?" htmlFor="review-feedback" required>
                <Textarea id="review-feedback" rows={4} autoFocus maxLength={1000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejecting(false)} disabled={reject.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending || feedback.trim() === ''}>
                {reject.isPending ? <Spinner /> : null}
                Send back
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
