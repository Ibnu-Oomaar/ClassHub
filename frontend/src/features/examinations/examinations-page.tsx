import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
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
import { getPage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';
import { ExaminationFormDialog } from './examination-form-dialog';
import { EXAMINATION_STATUSES, EXAMINATION_TYPES, type Examination } from './types';

const DEFAULTS = { search: '', status: '', type: '', when: '' };

function marksProgress(exam: Examination): string {
  const total = exam.subjects.length;
  if (total === 0) return '-';
  const approved = exam.subjects.filter((subject) => subject.marksStatus === 'APPROVED').length;
  return `${approved} of ${total} approved`;
}

export default function ExaminationsPage() {
  const me = useMe();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const isStudent = me.role === 'STUDENT';
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: [...keys.examinations, 'list', values, page],
    queryFn: () =>
      getPage<Examination>('/examinations', {
        page,
        limit: 20,
        search: values.search,
        status: values.status,
        type: values.type,
        upcoming: values.when === 'upcoming' ? true : undefined,
        sortBy: 'examDate',
        sortOrder: values.when === 'upcoming' ? 'ASC' : 'DESC',
      }),
    placeholderData: keepPreviousData,
  });

  const filtered = values.search !== '' || values.status !== '' || values.type !== '' || values.when !== '';
  const title = isStudent ? 'Exam timetable' : isClassMaster ? 'Examinations' : 'Exams and marks';
  const description = isClassMaster
    ? 'Create an examination, choose its subjects, then follow the marks from entry to approval to publishing.'
    : isStudent
      ? 'When your examinations take place and what they cover.'
      : 'Open an examination to enter marks for your subjects.';

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          isClassMaster ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Create examination
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search examinations" className="lg:w-72" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={values.when} onChange={(event) => update({ when: event.target.value })} aria-label="When" className="sm:w-40">
            <option value="">All dates</option>
            <option value="upcoming">Upcoming</option>
          </Select>
          <Select value={values.type} onChange={(event) => update({ type: event.target.value })} aria-label="Type" className="sm:w-40">
            <option value="">Any type</option>
            {EXAMINATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </Select>
          {!isStudent ? (
            <Select value={values.status} onChange={(event) => update({ status: event.target.value })} aria-label="Status" className="sm:w-44">
              <option value="">Any status</option>
              {EXAMINATION_STATUSES.filter((status) => isClassMaster || status !== 'DRAFT').map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={6} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              icon={<CalendarDays />}
              title="No examination matches"
              description="Try a different search or clear the filters."
              action={
                <Button variant="outline" onClick={() => update({ search: '', status: '', type: '', when: '' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<CalendarDays />}
              title={isClassMaster ? 'No examinations yet' : 'No examinations scheduled'}
              description={
                isClassMaster
                  ? 'Create the first examination, then teachers can enter their marks.'
                  : isStudent
                    ? 'Your examinations will be listed here once the Class Master schedules them.'
                    : 'You will see an examination here once the Class Master schedules one for your subjects.'
              }
              action={
                isClassMaster ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> Create the first examination
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
                  <TH>Examination</TH>
                  <TH>Date</TH>
                  <TH>Period</TH>
                  <TH>Subjects</TH>
                  {!isStudent ? <TH>Marks</TH> : null}
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((exam) => (
                  <TR key={exam.id}>
                    <TD>
                      <Link to={`/examinations/${exam.id}`} className="font-medium hover:underline">
                        {exam.name}
                      </Link>
                      <p className="text-[0.8125rem] text-muted-foreground">{humanize(exam.type)}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(exam.examDate)}</TD>
                    <TD>{exam.academicPeriod ?? '-'}</TD>
                    <TD>{exam.subjects.length}</TD>
                    {!isStudent ? <TD className="whitespace-nowrap">{marksProgress(exam)}</TD> : null}
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={exam.status} />
                        {exam.resultsPublished ? <Badge tone="success">Results published</Badge> : null}
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

      {isClassMaster ? <ExaminationFormDialog open={creating} onOpenChange={setCreating} examination={null} /> : null}
    </>
  );
}
