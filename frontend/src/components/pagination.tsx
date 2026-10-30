import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        Showing {from} to {to} of {meta.total}
      </p>
      {meta.totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
            <ChevronLeft /> Previous
          </Button>
          <span className="hidden sm:inline">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
            Next <ChevronRight />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
