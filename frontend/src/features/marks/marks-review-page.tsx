import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getPage } from '@/lib/api';
import { formatDate, formatDateTime, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';
import type { MarksQueueItem } from './types';

const TABS = [
  { value: 'SUBMITTED', label: 'Waiting for review', empty: 'No mark sheet is waiting for you. Sheets appear here when a teacher submits them.' },
  { value: 'APPROVED', label: 'Approved', empty: 'No mark sheet has been approved yet.' },
  { value: 'REJECTED', label: 'Sent back', empty: 'No mark sheet is with a teacher for correction.' },
  { value: 'DRAFT', label: 'Being entered', empty: 'No teacher is part-way through a sheet.' },
  { value: 'PENDING', label: 'Not started', empty: 'Every subject has been started.' },
] as const;

const DEFAULTS = { status: 'SUBMITTED' };

export default function MarksReviewPage() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const tab = TABS.find((item) => item.value === values.status) ?? TABS[0];

  const query = useQuery({
    queryKey: [...keys.marks, 'queue', tab.value, page],
    queryFn: () => getPage<MarksQueueItem>('/marks/queue', { status: tab.value, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Marks review" description="Teachers submit one mark sheet per subject. Check each sheet, then approve it or send it back with a reason." />

      <Tabs value={tab.value} onValueChange={(value) => update({ status: value })}>
        <TabsList aria-label="Mark sheet state">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab.value}>
          <QueryState
            query={query}
            skeleton={<RowsSkeleton rows={5} />}
            isEmpty={(data) => data.items.length === 0}
            empty={<EmptyState icon={<ClipboardCheck />} title="Nothing here" description={tab.empty} />}
          >
            {(data) => (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Examination</TH>
                      <TH>Subject</TH>
                      <TH className="text-right">Out of</TH>
                      <TH className="text-right">Entered</TH>
                      <TH>{tab.value === 'APPROVED' || tab.value === 'REJECTED' ? 'Reviewed' : 'Submitted'}</TH>
                      <TH className="text-right">Sheet</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.items.map((item) => (
                      <TR key={item.examinationSubjectId}>
                        <TD>
                          <Link to={`/examinations/${item.examinationId}`} className="font-medium hover:underline">
                            {item.examinationName}
                          </Link>
                          <p className="text-[0.8125rem] text-muted-foreground">{formatDate(item.examDate)}</p>
                        </TD>
                        <TD className="font-medium">{item.subjectName}</TD>
                        <TD className="text-right tabular-nums">{formatScore(item.maxMarks)}</TD>
                        <TD className="text-right tabular-nums">{item.entered}</TD>
                        <TD className="whitespace-nowrap text-[0.8125rem]">
                          {tab.value === 'APPROVED' || tab.value === 'REJECTED' ? formatDateTime(item.reviewedAt) : formatDateTime(item.submittedAt)}
                          {tab.value === 'REJECTED' && item.reviewFeedback ? <p className="mt-0.5 max-w-xs whitespace-normal text-pen">{item.reviewFeedback}</p> : null}
                        </TD>
                        <TD>
                          <div className="flex justify-end">
                            <Button size="sm" variant={tab.value === 'SUBMITTED' ? 'default' : 'outline'} asChild>
                              <Link to={`/marks/${item.examinationSubjectId}`}>{tab.value === 'SUBMITTED' ? 'Review' : 'Open'}</Link>
                            </Button>
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
        </TabsContent>
      </Tabs>
    </>
  );
}
