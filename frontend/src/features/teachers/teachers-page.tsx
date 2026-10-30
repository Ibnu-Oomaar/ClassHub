import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookMarked, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { AccountActions, type AccountStatusValue } from '@/components/account-actions';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TeacherSubjectsManager } from '@/features/teacher-subjects/teacher-subjects-manager';
import { del, getPage, patch, post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { useListParams } from '@/lib/use-list-params';
import { TeacherFormDialog } from './teacher-form-dialog';
import type { TeacherSummary } from './types';

const DEFAULTS = { search: '', status: '', view: 'current' };

export default function TeachersPage() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [formFor, setFormFor] = useState<{ id: string | null } | null>(null);
  const [removing, setRemoving] = useState<TeacherSummary | null>(null);
  const [subjectsOf, setSubjectsOf] = useState<TeacherSummary | null>(null);

  const query = useQuery({
    queryKey: [...keys.teachers, 'list', values, page],
    queryFn: () =>
      getPage<TeacherSummary>('/teachers', {
        page,
        limit: 20,
        search: values.search,
        status: values.status,
        unassignedOnly: values.view === 'unassigned' ? true : undefined,
        onlyDeleted: values.view === 'removed' ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const refresh = [keys.teachers, keys.subjects, keys.teacherSubjects, keys.dashboard];
  const changeStatus = useAction({
    run: ({ teacher, status }: { teacher: TeacherSummary; status: AccountStatusValue }) => patch(`/teachers/${teacher.id}/status`, { status }),
    refresh,
    success: (_data, { teacher, status }) =>
      `${teacher.fullName} is ${status === 'ACTIVE' ? 'allowed to sign in' : status === 'SUSPENDED' ? 'suspended' : 'deactivated'}.`,
  });
  const remove = useAction({
    run: (teacher: TeacherSummary) => del(`/teachers/${teacher.id}`),
    refresh,
    success: (_data, teacher) => `${teacher.fullName} is removed.`,
    onSuccess: () => setRemoving(null),
  });
  const restore = useAction({
    run: (teacher: TeacherSummary) => post(`/teachers/${teacher.id}/restore`),
    refresh,
    success: (_data, teacher) => `${teacher.fullName} is back.`,
  });

  const filtered = values.search !== '' || values.status !== '' || values.view !== 'current';

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Only you can create teacher accounts. A teacher sees and marks only the subjects you assign to them."
        actions={
          <Button onClick={() => setFormFor({ id: null })}>
            <Plus /> Add teacher
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search by name, username or email" className="sm:w-80" />
        <Select value={values.status} onChange={(event) => update({ status: event.target.value })} aria-label="Account status" className="sm:w-44">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>
        <Select value={values.view} onChange={(event) => update({ view: event.target.value })} aria-label="Which teachers" className="sm:w-52">
          <option value="current">Current teachers</option>
          <option value="unassigned">Without a subject</option>
          <option value="removed">Removed teachers</option>
        </Select>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={6} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              icon={<Users />}
              title="No teacher matches"
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" onClick={() => update({ search: '', status: '', view: 'current' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users />}
              title="No teachers yet"
              description="Create an account for each teacher, then give them the subjects they teach."
              action={
                <Button onClick={() => setFormFor({ id: null })}>
                  <Plus /> Add the first teacher
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Teacher</TH>
                  <TH>Signs in with</TH>
                  <TH>Subjects</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((teacher) => (
                  <TR key={teacher.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={teacher.fullName} photoUrl={teacher.hasPhoto ? `/teachers/${teacher.id}/photo` : null} className="size-9 text-xs" />
                        <span className="font-medium">{teacher.fullName}</span>
                      </div>
                    </TD>
                    <TD>
                      <p>{teacher.username ?? '-'}</p>
                      {teacher.email ? <p className="text-[0.8125rem] text-muted-foreground">{teacher.email}</p> : null}
                    </TD>
                    <TD>
                      {teacher.subjects.length === 0 ? (
                        <Badge tone="warning">No subject</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {teacher.subjects.map((subject) => (
                            <Badge key={subject.assignmentId} tone={subject.subjectActive ? 'primary' : 'neutral'}>
                              {subject.subjectName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TD>
                    <TD>{teacher.deletedAt ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={teacher.status} />}</TD>
                    <TD>
                      <div className="flex justify-end">
                        <AccountActions
                          name={teacher.fullName}
                          status={teacher.status}
                          removed={teacher.deletedAt !== null}
                          onEdit={() => setFormFor({ id: teacher.id })}
                          onStatus={(status) => changeStatus.mutate({ teacher, status })}
                          onRemove={() => setRemoving(teacher)}
                          onRestore={() => restore.mutate(teacher)}
                          extra={
                            <DropdownMenuItem onSelect={() => setSubjectsOf(teacher)}>
                              <BookMarked /> Assign subjects
                            </DropdownMenuItem>
                          }
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>

      <TeacherFormDialog open={formFor !== null} onOpenChange={(open) => !open && setFormFor(null)} teacherRecordId={formFor?.id ?? null} />

      <Dialog open={subjectsOf !== null} onOpenChange={(open) => !open && setSubjectsOf(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Subjects of {subjectsOf?.fullName}</DialogTitle>
            <DialogDescription>The teacher can enter marks and set assignments only for these subjects.</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-6">{subjectsOf ? <TeacherSubjectsManager scope={{ kind: 'teacher', teacherId: subjectsOf.id }} /> : null}</DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.fullName ?? 'teacher'}?`}
        description="They can no longer sign in. Marks and assignments they already created are kept, and you can restore the account later."
        confirmLabel="Remove teacher"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}
