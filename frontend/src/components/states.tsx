import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin-slow', className)} aria-hidden />;
}

/** Shown when a list or page has nothing in it yet: says what the space is for and how to fill it. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('ruled rounded-xl border border-dashed border-input bg-surface px-6 py-12 text-center', className)}>
      {icon ? <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-subtle text-muted-foreground [&_svg]:size-5">{icon}</div> : null}
      <p className="font-display text-lg">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('rounded-xl border border-pen/40 bg-pen/8 px-6 py-8 text-center', className)}>
      <AlertTriangle className="mx-auto mb-2 size-6 text-pen" aria-hidden />
      <p className="font-medium">This did not load</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/**
 * One place that decides what a data-driven screen shows: placeholders while loading, a retryable
 * message when the request failed, an empty state when there is nothing, otherwise the content.
 */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <RowsSkeleton />}</>;
  if (query.isError) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : 'Try again.'} onRetry={() => void query.refetch()} />;
  }
  if (isEmpty?.(query.data) && empty) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
