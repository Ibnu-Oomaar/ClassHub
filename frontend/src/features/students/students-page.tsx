import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { GraduationCap, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { AccountActions, type AccountStatusValue } from '@/components/account-actions';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { del, getPage, patch, post } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { useListParams } from '@/lib/use-list-params';
import { StudentFormDialog } from './student-form-dialog';
import type { StudentSummary } from './types';

const DEFAULTS = { search: '', status: '', gender: '', view: 'current' };

export default function StudentsPage() {
  const me = useMe();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [formFor, setFormFor] = useState<{ id: string | null } | null>(null);
  const [removing, setRemoving] = useState<StudentSummary | null>(null);

  const query = useQuery({
    queryKey: [...keys.students, 'list', values, page],
    queryFn: () =>
      getPage<StudentSummary>('/students', {
        page,
        limit: 20,
        search: values.search,
        status: values.status,
        gender: values.gender,
        onlyDeleted: isClassMaster && values.view === 'removed' ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const refresh = [keys.students, keys.dashboard];
  const changeStatus = useAction({
    run: ({ student, status }: { student: StudentSummary; status: AccountStatusValue }) => patch(`/students/${student.id}/status`, { status }),
    refresh,
    success: (_data, { student, status }) =>
      `${student.fullName} is ${status === 'ACTIVE' ? 'allowed to sign in' : status === 'SUSPENDED' ? 'suspended' : 'deactivated'}.`,
  });
  const remove = useAction({
    run: (student: StudentSummary) => del(`/students/${student.id}`),
    refresh,
    success: (_data, student) => `${student.fullName} is removed. Published results keep their history.`,
    onSuccess: () => setRemoving(null),
  });
  const restore = useAction({
    run: (student: StudentSummary) => post(`/students/${student.id}/restore`),
    refresh,
    success: (_data, student) => `${student.fullName} is back in the class.`,
  });

  const filtered = values.search !== '' || values.status !== '' || values.gender !== '' || values.view === 'removed';

  return (
    <>
      <PageHeader
        title="Students"
        description={
          isClassMaster
            ? 'Everyone in 3C Morning Boys. You create each account; students cannot register themselves.'
            : 'The students in 3C Morning Boys.'
        }
        actions={
          isClassMaster ? (
            <Button onClick={() => setFormFor({ id: null })}>
              <Plus /> Add student
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search by name or Student ID" className="lg:w-80" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={values.status} onChange={(event) => update({ status: event.target.value })} aria-label="Account status" className="sm:w-44">
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </Select>
          <Select value={values.gender} onChange={(event) => update({ gender: event.target.value })} aria-label="Gender" className="sm:w-40">
            <option value="">Any gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
          {isClassMaster ? (
            <Select value={values.view} onChange={(event) => update({ view: event.target.value })} aria-label="Which students" className="sm:w-48">
              <option value="current">Current students</option>
              <option value="removed">Removed students</option>
            </Select>
          ) : null}
        </div>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={7} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              icon={<GraduationCap />}
              title={values.view === 'removed' ? 'No removed students' : 'No student matches'}
              description={values.view === 'removed' ? 'Students you remove appear here so you can bring them back.' : 'Try a different search or clear the filters.'}
              action={
                <Button variant="outline" onClick={() => update({ search: '', status: '', gender: '', view: 'current' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<GraduationCap />}
              title="No students yet"
              description={
                isClassMaster
                  ? 'Add each student with a full name and a unique Student ID. That pair is how they sign in.'
                  : 'The Class Master has not added any students yet.'
              }
              action={
                isClassMaster ? (
                  <Button onClick={() => setFormFor({ id: null })}>
                    <Plus /> Add the first student
                  </Button>
                ) : null
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
                  <TH>Student</TH>
                  <TH>Student ID</TH>
                  <TH>Gender</TH>
                  <TH>Status</TH>
                  <TH>Joined</TH>
                  {isClassMaster ? <TH className="text-right">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {data.items.map((student) => (
                  <TR key={student.id}>
                    <TD>
                      <Link to={`/students/${student.id}`} className="flex items-center gap-3 font-medium hover:underline">
                        <Avatar name={student.fullName} photoUrl={student.hasPhoto ? `/students/${student.id}/photo` : null} className="size-9 text-xs" />
                        {student.fullName}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{student.studentId}</TD>
                    <TD>{student.gender ? humanize(student.gender) : '-'}</TD>
                    <TD>{student.deletedAt ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={student.status} />}</TD>
                    <TD className="whitespace-nowrap">{formatDate(student.registeredAt)}</TD>
                    {isClassMaster ? (
                      <TD>
                        <div className="flex justify-end">
                          <AccountActions
                            name={student.fullName}
                            status={student.status}
                            removed={student.deletedAt !== null}
                            onEdit={() => setFormFor({ id: student.id })}
                            onStatus={(status) => changeStatus.mutate({ student, status })}
                            onRemove={() => setRemoving(student)}
                            onRestore={() => restore.mutate(student)}
                          />
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>

      {isClassMaster ? (
        <>
          <StudentFormDialog open={formFor !== null} onOpenChange={(open) => !open && setFormFor(null)} studentRecordId={formFor?.id ?? null} />
          <ConfirmDialog
            open={removing !== null}
            onOpenChange={(open) => !open && setRemoving(null)}
            title={`Remove ${removing?.fullName ?? 'student'}?`}
            description="They can no longer sign in and disappear from the class lists. Their published results stay in the history, and you can restore them later."
            confirmLabel="Remove student"
            tone="danger"
            pending={remove.isPending}
            onConfirm={() => removing && remove.mutate(removing)}
          />
        </>
      ) : null}
    </>
  );
}
