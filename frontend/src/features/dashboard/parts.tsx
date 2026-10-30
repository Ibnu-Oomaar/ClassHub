import { ChevronRight, Pin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatRelative, humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardAnnouncementItem, DashboardExamItem } from './types';

/** A row of big numbers separated by rules, like the totals at the bottom of a register. */
export function TallyRow({ items }: { items: { label: string; value: string | number; note?: string; to?: string }[] }) {
  return (
    <dl className="mb-9 grid grid-cols-2 divide-border border-y border-border sm:grid-cols-4 sm:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-border sm:[&>*:nth-child(n+3)]:border-t-0">
      {items.map((item) => {
        const body = (
          <>
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-display text-4xl leading-none text-foreground">{item.value}</dd>
            {item.note ? <dd className="mt-1.5 text-[0.8125rem] text-muted-foreground">{item.note}</dd> : null}
          </>
        );
        return item.to ? (
          <Link key={item.label} to={item.to} className="block px-4 py-4 transition-colors hover:bg-subtle/60 focus-visible:bg-subtle/60 sm:first:pl-0">
            {body}
          </Link>
        ) : (
          <div key={item.label} className="px-4 py-4 sm:first:pl-0">
            {body}
          </div>
        );
      })}
    </dl>
  );
}

export function PanelTitle({ children, to, linkLabel }: { children: ReactNode; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 border-b-2 border-border pb-2">
      <h2 className="text-lg">{children}</h2>
      {to ? (
        <Link to={to} className="text-sm font-medium text-primary hover:underline">
          {linkLabel ?? 'See all'}
        </Link>
      ) : null}
    </div>
  );
}

export function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-5 text-sm text-muted-foreground">{children}</p>;
}

/** One line of a list: what it is, a short detail under it, and something on the right. */
export function Row({
  to,
  title,
  detail,
  aside,
  className,
}: {
  to?: string;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {detail ? <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">{detail}</p> : null}
      </div>
      {aside ? <div className="shrink-0 text-right text-sm">{aside}</div> : null}
      {to ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  const base = cn('flex items-center gap-3 border-b border-border py-3 last:border-0', className);
  return to ? (
    <Link to={to} className={cn(base, 'transition-colors hover:bg-subtle/50')}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}

/** Something that needs the person to act: a count in front of a plain sentence. */
export function Attention({ count, to, children }: { count: number; to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-4 border-b border-border py-3 transition-colors last:border-0 hover:bg-subtle/50">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-highlight/50 font-display text-lg text-foreground">{count}</span>
        <span className="min-w-0 flex-1 text-[0.9375rem]">{children}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function UpcomingExams({ items }: { items: DashboardExamItem[] }) {
  if (items.length === 0) return <Quiet>No examinations are scheduled.</Quiet>;
  return (
    <div>
      {items.map((exam) => (
        <Row
          key={exam.id}
          to={`/examinations/${exam.id}`}
          title={exam.name}
          detail={[humanize(exam.type), exam.academicPeriod].filter(Boolean).join(' in ')}
          aside={<span className="font-medium">{formatDate(exam.examDate)}</span>}
        />
      ))}
    </div>
  );
}

export function AnnouncementList({ items }: { items: DashboardAnnouncementItem[] }) {
  if (items.length === 0) return <Quiet>Nothing has been announced.</Quiet>;
  return (
    <div>
      {items.map((item) => (
        <Row
          key={item.id}
          to="/announcements"
          title={
            <span className="inline-flex items-center gap-1.5">
              {item.isPinned ? <Pin className="size-3.5 text-pen" aria-label="Pinned" /> : null}
              {item.title}
            </span>
          }
          detail={formatRelative(item.publishedAt)}
          aside={item.audience !== 'ALL' ? <Badge>{humanize(item.audience)}</Badge> : null}
        />
      ))}
    </div>
  );
}
