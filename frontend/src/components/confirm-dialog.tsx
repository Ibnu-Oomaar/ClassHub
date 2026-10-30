import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/states';

/** Asks before something that cannot be undone easily. The action keeps its name on the button. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  pending?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-foreground/45" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-2xl border border-border bg-surface p-6 shadow-sheet focus-visible:outline-none">
          <AlertDialog.Title className="font-display text-xl">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialog.Description>
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={onConfirm} disabled={pending}>
              {pending ? <Spinner /> : null}
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
