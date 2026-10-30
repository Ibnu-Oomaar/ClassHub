import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { Examination } from '@/features/examinations/types';
import { getPage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';

const DEFAULTS = { search: '', published: '' };

function state(exam: Examination): { tone: 'success' | 'primary' | 'neutral'; label: string } {
  if (exam.resultsPublished) return { tone: 'success', label: 'Published' };
  const total = exam.subjects.length;
  const approved = exam.subjects.filter((subject) => subject.marksStatus === 'APPROVED').length;
  if (total > 0 && approved === total) return { tone: 'primary', label: 'Ready to publish' };
  return { tone: 'neutral', label: `${approved} of ${total} subjects approved` };
}

export default function ClassMasterResultsList() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const query = useQuery({
    queryKey: [...keys.examinations, 'for-results', values, page],
    queryFn: () =>
      getPage<Examination>('/examinations', {
        page,
        limit: 20,
        search: values.search,
        resultsPublished: values.published === '' ? undefined : values.published === 'yes',
        sortBy: 'examDate',
        sortOrder: 'DESC',
      }),
    placeholderData: keepPreviousData,
  });
  const filtered = values.search !== '' || values.published !== '';

  return (
    <>
      <PageHeader title="Results" description="Check the standings of an examination, then publish them so students can see their own marks." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search examinations" className="sm:w-72" />
        <Select value={values.published} onChange={(event) => update({ published: event.target.value })} aria-label="Published or not" className="sm:w-52">
          <option value="">All examinations</option>
          <option value="no">Not published</option>
          <option value="yes">Published</option>
        </Select>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={5} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Trophy />}
            title={filtered ? 'No examination matches' : 'No examinations yet'}
            description={filtered ? 'Try a different search or clear the filter.' : 'Create an examination and approve the marks of every subject to see standings here.'}
            action={
              filtered ? (
                <Button variant="outline" onClick={() => update({ search: '', published: '' })}>
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/examinations">Go to examinations</Link>
                </Button>
              )
            }
          />
        }
      >
        {(data) => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Examination</TH>
                  <TH>Date</TH>
                  <TH>State</TH>
                  <TH className="text-right">Standings</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((exam) => {
                  const current = state(exam);
                  return (
                    <TR key={exam.id}>
                      <TD>
                        <Link to={`/results/${exam.id}`} className="font-medium hover:underline">
                          {exam.name}
                        </Link>
                        <p className="text-[0.8125rem] text-muted-foreground">
                          {humanize(exam.type)}
                          {exam.academicPeriod ? `, ${exam.academicPeriod}` : ''}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(exam.examDate)}</TD>
                      <TD>
                        <Badge tone={current.tone}>{current.label}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          <Button size="sm" variant={current.label === 'Ready to publish' ? 'default' : 'outline'} asChild>
                            <Link to={`/results/${exam.id}`}>{current.label === 'Ready to publish' ? 'Review and publish' : 'Open'}</Link>
                          </Button>
                        </div>
                      </TD>
                    </TR>
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
