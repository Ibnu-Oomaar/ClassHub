import { Ban, CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Trash2, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type AccountStatusValue = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/** The row menu of a student or teacher: edit, change what the account may do, remove or bring back. */
export function AccountActions({
  name,
  status,
  removed,
  onEdit,
  onStatus,
  onRemove,
  onRestore,
  extra,
}: {
  name: string;
  status: AccountStatusValue;
  removed: boolean;
  onEdit: () => void;
  onStatus: (status: AccountStatusValue) => void;
  onRemove: () => void;
  onRestore: () => void;
  extra?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {removed ? (
          <DropdownMenuItem onSelect={onRestore}>
            <RotateCcw /> Restore {name.split(' ')[0]}
          </DropdownMenuItem>
        ) : (
          <>
            {extra}
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            {status !== 'ACTIVE' ? (
              <DropdownMenuItem onSelect={() => onStatus('ACTIVE')}>
                <CheckCircle2 /> Allow sign in
              </DropdownMenuItem>
            ) : null}
            {status !== 'SUSPENDED' ? (
              <DropdownMenuItem onSelect={() => onStatus('SUSPENDED')}>
                <Ban /> Suspend for now
              </DropdownMenuItem>
            ) : null}
            {status !== 'DEACTIVATED' ? (
              <DropdownMenuItem onSelect={() => onStatus('DEACTIVATED')}>
                <UserX /> Deactivate
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={onRemove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
