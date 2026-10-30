import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction } from '@/lib/use-action';
import type { Backup, RestoreOutcome } from './types';

/**
 * Restoring replaces every record in the database with the contents of the backup. It asks for the
 * Class Master's password and for the word RESTORE to be typed, so it cannot happen by accident.
 */
export function RestoreDialog({ backup, onClose }: { backup: Backup | null; onClose: () => void }) {
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);

  const reset = () => {
    setPassword('');
    setConfirmation('');
  };

  const restore = useAction({
    run: () => post<RestoreOutcome>(`/backups/${backup?.id}/restore`, { password, confirmation }, { timeout: 30 * 60_000 }),
    // No refresh here: after a restore the old session may not exist any more, so the next step is to sign in again.
    quiet: true,
    onSuccess: (result) => {
      reset();
      setOutcome(result);
    },
  });

  const canRestore = password.length > 0 && confirmation === 'RESTORE';

  if (outcome) {
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent size="sm" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>The backup is restored</DialogTitle>
            <DialogDescription>The data now matches {outcome.restoredFrom.displayName}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 pb-2">
            <Alert tone="success" title="A safety copy was made first">
              {outcome.safetyBackup.displayName} holds everything as it was just before the restore. Restore it from the list to undo this.
            </Alert>
            {outcome.warnings.length > 0 ? (
              <Alert tone="warning" title="Things to know">
                <ul className="list-disc space-y-0.5 pl-5">
                  {outcome.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">Everyone is signed out because the accounts may have changed. Sign in again to continue.</p>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setOutcome(null);
                onClose();
                logout();
              }}
            >
              Sign in again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={backup !== null}
      onOpenChange={(open) => {
        if (!open && !restore.isPending) {
          reset();
          restore.reset();
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (canRestore) restore.mutate();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>{backup ? `${backup.displayName}, made ${formatDateTime(backup.createdAt)}` : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            <Alert tone="danger" title="This replaces everything">
              Students, teachers, marks, results and settings go back to how they were in this backup. Anything entered since then is lost. A safety copy of the current data is made first, so you can undo it.
            </Alert>
            <Alert tone="info">Uploaded files such as photos and assignment attachments are not part of a backup, so they are left as they are.</Alert>
            {restore.isError ? <Alert tone="danger">{restore.error.message}</Alert> : null}
            <Field label="Your password" htmlFor="restore-password" required>
              <Input id="restore-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={restore.isPending} />
            </Field>
            <Field label="Type RESTORE to confirm" htmlFor="restore-confirm" required>
              <Input id="restore-confirm" autoComplete="off" autoCapitalize="characters" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={restore.isPending} />
            </Field>
            {restore.isPending ? <p className="text-sm text-muted-foreground">Restoring. This can take a minute. Keep this page open.</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => {
                reset();
                restore.reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!canRestore || restore.isPending}>
              {restore.isPending ? <Spinner /> : null}
              Restore backup
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
