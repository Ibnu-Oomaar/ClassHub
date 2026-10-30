import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, EyeOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { Subject } from '@/features/subjects/types';
import { getPage } from '@/lib/api';
import { formatDateTime, formatRelative, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';
import { AssignmentFormDialog } from './assignment-form-dialog';
import type { Assignment } from './types';

const DEFAULTS = { search: '', subject: '', filter: '' };

export default function AssignmentsPage() {
  const me = useMe();
  const isTeacher = me.role === 'TEACHER';
  const isStudent = me.role === 'STUDENT';
  const isClassMaster = me.role === 'CLASS_MASTER';
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [creating, setCreating] = useState(false);

  const subjects = useQuery({
    queryKey: [...keys.subjects, 'filter-options', me.role, me.teacherProfileId],
    queryFn: async () => (await getPage<Subject>('/subjects', { limit: 200, teacherId: isTeacher ? me.teacherProfileId : undefined })).items,
    enabled: !isStudent,
  });

  const query = useQuery({
    queryKey: [...keys.assignments, 'list', values, page],
    queryFn: () =>
      getPage<Assignment>('/assignments', {
        page,
        limit: 20,
        search: values.search,
        subjectId: values.subject,
        time: values.filter === 'open' ? 'OPEN' : values.filter === 'closed' ? 'CLOSED' : undefined,
        pendingGrading: values.filter === 'grading' ? true : undefined,
        notSubmitted: values.filter === 'todo' ? true : undefined,
        sortBy: 'dueAt',
        sortOrder: 'DESC',
      }),
    placeholderData: keepPreviousData,
  });

  const filtered = values.search !== '' || values.subject !== '' || values.filter !== '';

  return (
    <>
      <PageHeader
        title="Assignments"
        description={
          isTeacher
            ? 'Set work for your subjects, then grade what students hand in.'
            : isStudent
              ? 'Work your teachers have set. Hand it in before the deadline.'
              : 'Every assignment in the class and how many students have handed it in.'
        }
        actions={
          isTeacher ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New assignment
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search assignments" className="lg:w-72" />
        <div className="flex flex-col gap-3 sm:flex-row">
          {!isStudent ? (
            <Select value={values.subject} onChange={(event) => update({ subject: event.target.value })} aria-label="Subject" className="sm:w-48">
              <option value="">All subjects</option>
              {(subjects.data ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select value={values.filter} onChange={(event) => update({ filter: event.target.value })} aria-label="Show" className="sm:w-52">
            <option value="">Everything</option>
            <option value="open">Before the deadline</option>
            <option value="closed">Past the deadline</option>
            {isStudent ? <option value="todo">Not handed in yet</option> : null}
            {isTeacher ? <option value="grading">Waiting to be graded</option> : null}
          </Select>
        </div>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={6} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              icon={<ClipboardList />}
              title="No assignment matches"
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" onClick={() => update({ search: '', subject: '', filter: '' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ClipboardList />}
              title="No assignments yet"
              description={isTeacher ? 'Create the first assignment for one of your subjects.' : isStudent ? 'When a teacher sets work for the class, it appears here.' : 'Teachers create assignments for their own subjects.'}
              action={
                isTeacher ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> Create an assignment
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
                  <TH>Assignment</TH>
                  {isClassMaster ? <TH>Teacher</TH> : null}
                  <TH>Deadline</TH>
                  <TH>State</TH>
                  <TH>{isStudent ? 'My work' : 'Handed in'}</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((assignment) => (
                  <TR key={assignment.id}>
                    <TD>
                      <Link to={`/assignments/${assignment.id}`} className="font-medium hover:underline">
                        {assignment.title}
                      </Link>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        {assignment.subjectName}, out of {formatScore(assignment.maxMarks)}
                      </p>
                    </TD>
                    {isClassMaster ? <TD>{assignment.teacherName}</TD> : null}
                    <TD className="whitespace-nowrap">
                      {formatDateTime(assignment.dueAt)}
                      <p className="text-[0.8125rem] text-muted-foreground">{formatRelative(assignment.dueAt)}</p>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={assignment.state} />
                        {!isStudent && !assignment.isAvailable ? (
                          <Badge>
                            <EyeOff className="size-3" /> Hidden
                          </Badge>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {isStudent ? (
                        assignment.mySubmission ? (
                          <span className="flex items-center gap-1.5">
                            <StatusBadge status={assignment.mySubmission.status} />
                            {assignment.mySubmission.isLate ? <Badge tone="warning">Late</Badge> : null}
                          </span>
                        ) : (
                          <StatusBadge status="NOT_SUBMITTED" />
                        )
                      ) : (
                        <span className="tabular-nums">
                          {assignment.submissionsCount ?? 0} handed in, {assignment.gradedCount ?? 0} graded
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>

      {isTeacher ? <AssignmentFormDialog open={creating} onOpenChange={setCreating} assignment={null} /> : null}
    </>
  );
}
