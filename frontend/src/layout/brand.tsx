import { useSetupStatus } from '@/auth/guards';
import { cn } from '@/lib/utils';

/** The CLASSHUB mark: an exercise book with its red margin line. */
export function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path d="M18 14h28a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H18z" className="fill-primary-foreground" />
      <path d="M26 14v36" stroke="var(--pen)" strokeWidth="2.5" />
      <path d="M32 26h12M32 33h12M32 40h8" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BookIcon className={compact ? 'size-7' : 'size-9'} />
      <span className={cn('font-display tracking-tight', compact ? 'text-lg' : 'text-[1.4rem]')}>CLASSHUB</span>
    </span>
  );
}

/** The class name as it would be written on the label of a school exercise book. */
export function ClassSticker({ className }: { className?: string }) {
  const setup = useSetupStatus();
  return (
    <div className={cn('-rotate-1 rounded-md border border-border bg-background px-3 py-1.5', className)}>
      <p className="font-display text-[0.95rem] leading-snug">{setup.data?.className ?? '3C Morning Boys'}</p>
    </div>
  );
}
