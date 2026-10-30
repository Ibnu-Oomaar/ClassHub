import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, Section } from '@/components/page-header';
import { PenGrade } from '@/components/pen-mark';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { get } from '@/lib/api';
import { formatDate, formatPercent, formatScore, humanize, ordinal } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { ProgressChart } from './progress-chart';
import type { MyResultSummary } from './types';

export default function MyResultsList() {
  const query = useQuery({ queryKey: [...keys.results, 'mine'], queryFn: () => get<MyResultSummary[]>('/results/my') });

  return (
    <>
      <PageHeader title="My results" description="Published results of your examinations, newest first. You only ever see your own." />
      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={4} />}
        isEmpty={(results) => results.length === 0}
        empty={
          <EmptyState
            icon={<BookOpenCheck />}
            title="No published results yet"
            description="When the Class Master publishes an examination, your marks, grade and position appear here."
          />
        }
      >
        {(results) => {
          const oldestFirst = [...results].sort((a, b) => a.examDate.localeCompare(b.examDate));
          return (
            <>
              {results.length > 1 ? (
                <Section title="How you are doing" description="Your percentage in each examination, oldest to newest.">
                  <ProgressChart
                    points={oldestFirst.map((result) => ({
                      id: result.examinationId,
                      label: result.examinationName,
                      value: result.percentage,
                      detail: `${formatDate(result.examDate)}${result.grade ? `, grade ${result.grade}` : ''}`,
                    }))}
                  />
                </Section>
              ) : null}

              <Table>
                <THead>
                  <TR>
                    <TH>Examination</TH>
                    <TH>Date</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Percent</TH>
                    <TH className="text-center">Grade</TH>
                    <TH>Position</TH>
                  </TR>
                </THead>
                <TBody>
                  {results.map((result) => (
                    <TR key={result.examinationId}>
                      <TD>
                        <Link to={`/results/${result.examinationId}`} className="font-medium hover:underline">
                          {result.examinationName}
                        </Link>
                        <p className="text-[0.8125rem] text-muted-foreground">
                          {humanize(result.examinationType)}
                          {result.academicPeriod ? `, ${result.academicPeriod}` : ''}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(result.examDate)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {formatScore(result.totalScore)} / {formatScore(result.totalMax)}
                      </TD>
                      <TD className="text-right tabular-nums">{formatPercent(result.percentage)}</TD>
                      <TD className="text-center">
                        <PenGrade grade={result.grade} size="sm" />
                      </TD>
                      <TD className="whitespace-nowrap">
                        {ordinal(result.rank)} of {result.classSize}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
