import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMe } from '@/auth/auth-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { del, getPage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { useListParams } from '@/lib/use-list-params';
import { AnnouncementFormDialog } from './announcement-form-dialog';
import { AUDIENCE_LABEL, type Announcement } from './types';

const DEFAULTS = { state: 'ACTIVE' };

export default function AnnouncementsPage() {
  const me = useMe();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [formFor, setFormFor] = useState<{ announcement: Announcement | null } | null>(null);
  const [removing, setRemoving] = useState<Announcement | null>(null);

  const query = useQuery({
    queryKey: [...keys.announcements, 'list', isClassMaster ? values.state : 'visible', page],
    queryFn: () => getPage<Announcement>('/announcements', { page, limit: 10, state: isClassMaster ? values.state : undefined }),
    placeholderData: keepPreviousData,
  });

  const remove = useAction({
    run: (announcement: Announcement) => del(`/announcements/${announcement.id}`),
    refresh: [keys.announcements, keys.dashboard],
    success: 'The announcement is deleted.',
    onSuccess: () => setRemoving(null),
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description={isClassMaster ? 'Notices for the class. Choose who each one is for.' : 'Notices from the Class Master.'}
        actions={
          isClassMaster ? (
            <Button onClick={() => setFormFor({ announcement: null })}>
              <Plus /> New announcement
            </Button>
          ) : null
        }
      />

      {isClassMaster ? (
        <Tabs value={values.state} onValueChange={(state) => update({ state })} className="mb-5">
          <TabsList aria-label="Announcement state">
            <TabsTrigger value="ACTIVE">Published</TabsTrigger>
            <TabsTrigger value="DRAFT">Drafts</TabsTrigger>
            <TabsTrigger value="EXPIRED">Expired</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={4} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Megaphone />}
            title={isClassMaster ? (values.state === 'DRAFT' ? 'No drafts' : values.state === 'EXPIRED' ? 'Nothing has expired' : 'No announcements yet') : 'Nothing has been announced'}
            description={isClassMaster ? 'Write a notice and it appears on the home page of the people you choose.' : 'New notices from the Class Master will show here.'}
            action={
              isClassMaster && values.state === 'ACTIVE' ? (
                <Button onClick={() => setFormFor({ announcement: null })}>
                  <Plus /> Write the first announcement
                </Button>
              ) : null
            }
          />
        }
      >
        {(data) => (
          <>
            <div className="space-y-5">
              {data.items.map((item) => (
                <article key={item.id} className="ruled margin-line rounded-xl border border-border bg-surface py-5 pl-14 pr-5 sm:pl-16">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex flex-wrap items-center gap-2 text-xl">
                        {item.isPinned ? <Pin className="size-4 text-pen" aria-label="Pinned" /> : null}
                        {item.title}
                      </h2>
                      <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                        {item.authorName}, {item.publishedAt ? `${formatRelative(item.publishedAt)}` : `written ${formatRelative(item.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isClassMaster ? <Badge>{AUDIENCE_LABEL[item.audience]}</Badge> : null}
                      {isClassMaster && item.state !== 'ACTIVE' ? <StatusBadge status={item.state} /> : null}
                    </div>
                  </header>
                  <p className="mt-3 max-w-prose whitespace-pre-line break-words">{item.body}</p>
                  {item.expiresAt ? <p className="mt-3 text-[0.8125rem] text-muted-foreground">{item.state === 'EXPIRED' ? 'Expired' : 'Hidden after'} {formatDateTime(item.expiresAt)}</p> : null}
                  {isClassMaster ? (
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFormFor({ announcement: item })}>
                        <Pencil /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRemoving(item)}>
                        <Trash2 className="text-pen" /> Delete
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>

      {isClassMaster ? (
        <>
          <AnnouncementFormDialog open={formFor !== null} onOpenChange={(open) => !open && setFormFor(null)} announcement={formFor?.announcement ?? null} />
          <ConfirmDialog
            open={removing !== null}
            onOpenChange={(open) => !open && setRemoving(null)}
            title="Delete this announcement?"
            description={removing ? `"${removing.title}" disappears for everyone.` : ''}
            confirmLabel="Delete announcement"
            tone="danger"
            pending={remove.isPending}
            onConfirm={() => removing && remove.mutate(removing)}
          />
        </>
      ) : null}
    </>
  );
}
