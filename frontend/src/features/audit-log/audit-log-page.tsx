import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { Fragment, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getPage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';
import { AUDIT_ACTION_GROUPS, type AuditLogEntry } from './types';

const DEFAULTS = { search: '', action: '', from: '', to: '' };

function toneOf(action: string): BadgeTone {
  if (action.endsWith('_FAILED') || action.endsWith('_LOCKED') || action.endsWith('_REJECTED')) return 'danger';
  if (action.endsWith('_DELETED') || action.endsWith('_UNPUBLISHED') || action === 'BACKUP_RESTORED') return 'warning';
  if (action.endsWith('_CREATED') || action.endsWith('_APPROVED') || action.endsWith('_PUBLISHED') || action.endsWith('_ACTIVATED')) return 'success';
  return 'neutral';
}

export default function AuditLogPage() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: [...keys.auditLog, values, page],
    queryFn: () =>
      getPage<AuditLogEntry>('/audit-logs', {
        page,
        limit: 25,
        search: values.search,
        action: values.action,
        from: values.from ? new Date(`${values.from}T00:00:00`).toISOString() : undefined,
        to: values.to ? new Date(`${values.to}T23:59:59.999`).toISOString() : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const filtered = Object.entries(values).some(([key, value]) => value !== DEFAULTS[key as keyof typeof DEFAULTS]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of who did what: sign-ins, changes to people and marks, publishing, backups. It cannot be edited." />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[18rem_16rem_10rem_10rem]">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search who or what" />
        <Select value={values.action} onChange={(event) => update({ action: event.target.value })} aria-label="Kind of event">
          <option value="">Every kind of event</option>
          {AUDIT_ACTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.actions.map((action) => (
                <option key={action} value={action}>
                  {humanize(action)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Input type="date" value={values.from} onChange={(event) => update({ from: event.target.value })} aria-label="From date" />
        <Input type="date" value={values.to} onChange={(event) => update({ to: event.target.value })} aria-label="To date" />
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={8} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<History />}
            title={filtered ? 'No event matches' : 'Nothing has happened yet'}
            description={filtered ? 'Try a different search or widen the dates.' : 'Every sign-in and change is recorded here from now on.'}
            action={
              filtered ? (
                <Button variant="outline" onClick={() => update({ search: '', action: '', from: '', to: '' })}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        }
      >
        {(data) => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="w-10" />
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>What</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((entry) => {
                  const expanded = open.has(entry.id);
                  const hasMore = entry.details !== null || entry.ipAddress !== null || entry.entityId !== null;
                  return (
                    <Fragment key={entry.id}>
                      <TR>
                        <TD>
                          {hasMore ? (
                            <Button variant="ghost" size="icon-sm" aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'} onClick={() => toggle(entry.id)}>
                              {expanded ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap text-[0.8125rem]">{formatDateTime(entry.createdAt)}</TD>
                        <TD>
                          <p className="font-medium">{entry.actorName}</p>
                          {entry.actorRole ? <p className="text-[0.8125rem] text-muted-foreground">{humanize(entry.actorRole)}</p> : null}
                        </TD>
                        <TD>
                          <Badge tone={toneOf(entry.action)}>{humanize(entry.action)}</Badge>
                          <p className="mt-1 break-words">{entry.summary}</p>
                        </TD>
                      </TR>
                      {expanded ? (
                        <TR className="bg-subtle/40 hover:bg-subtle/40">
                          <TD />
                          <TD colSpan={3}>
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[0.8125rem] sm:grid-cols-[8rem_1fr]">
                              <dt className="text-muted-foreground">Record</dt>
                              <dd>
                                {entry.entityType}
                                {entry.entityId ? <span className="ml-2 break-all text-muted-foreground">{entry.entityId}</span> : null}
                              </dd>
                              {entry.ipAddress ? (
                                <>
                                  <dt className="text-muted-foreground">Address</dt>
                                  <dd>{entry.ipAddress}</dd>
                                </>
                              ) : null}
                              {entry.details ? (
                                <>
                                  <dt className="text-muted-foreground">Details</dt>
                                  <dd>
                                    <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 font-sans text-xs leading-relaxed">
                                      {JSON.stringify(entry.details, null, 2)}
                                    </pre>
                                  </dd>
                                </>
                              ) : null}
                            </dl>
                          </TD>
                        </TR>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}
