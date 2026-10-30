import { Alert } from '@/components/ui/alert';
import { PenGrade, PenScore } from '@/components/pen-mark';
import { Link } from 'react-router-dom';
import { formatDate, formatPercent, formatRelative, humanize, pluralize } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';
import { AnnouncementList, PanelTitle, Quiet, Row, UpcomingExams } from './parts';
import type { StudentDashboard } from './types';

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  const latest = data.results.latest;

  return (
    <>
      {latest ? (
        <section className="ruled margin-line mb-9 rounded-xl border border-border bg-surface py-6 pl-14 pr-5 sm:pl-16">
          <p className="text-sm text-muted-foreground">Your latest result</p>
          <h2 className="mt-0.5 text-xl">{latest.examinationName}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
            <PenGrade grade={latest.grade} size="lg" />
            <div>
              <PenScore score={latest.totalScore} max={latest.totalMax} size="md" />
              <p className="mt-2 text-sm text-muted-foreground">
                {formatPercent(latest.percentage)}, position {latest.rank} of {latest.classSize}
                {latest.gradeRemark ? `, ${latest.gradeRemark}` : ''}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm">
            <Link to={`/results/${latest.examinationId}`} className="font-medium text-primary hover:underline">See every subject</Link>
            {data.results.published > 1 ? (
              <span className="text-muted-foreground">
                {' '}
                or all {data.results.published} results, averaging {formatPercent(data.results.averagePercentage)}.
              </span>
            ) : null}
          </p>
        </section>
      ) : (
        <Alert tone="info" title="No results yet" className="mb-9">Your marks appear here as soon as the Class Master publishes an examination.</Alert>
      )}

      {data.assignments.toDo > 0 ? (
        <p className="mb-7 text-[0.9375rem]">
          You have <span className="font-semibold">{pluralize(data.assignments.toDo, 'assignment')}</span> to hand in
          {data.assignments.overdue > 0 ? <>, <span className="font-semibold text-pen">{data.assignments.overdue} past the deadline</span></> : null}.
          {!data.assignments.submissionsEnabled ? ' Submissions are switched off for now.' : null}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-12 gap-y-9 lg:grid-cols-2">
        <div className="space-y-9">
          <section>
            <PanelTitle to="/assignments">To hand in</PanelTitle>
            {data.assignmentsToDo.length === 0 ? (
              <Quiet>You have handed everything in.</Quiet>
            ) : (
              data.assignmentsToDo.map((item) => (
                <Row
                  key={item.id}
                  to={`/assignments/${item.id}`}
                  title={item.title}
                  detail={`${item.subjectName}, ${formatDate(item.dueAt)}`}
                  aside={<StatusBadge status={item.state} />}
                />
              ))
            )}
          </section>

          <section>
            <PanelTitle to="/assignments">Recently graded</PanelTitle>
            {data.recentGrades.length === 0 ? (
              <Quiet>Graded work shows here.</Quiet>
            ) : (
              data.recentGrades.map((item) => (
                <Row
                  key={item.submissionId}
                  to="/assignments"
                  title={item.assignmentTitle}
                  detail={`${item.subjectName}${item.gradedAt ? `, ${formatRelative(item.gradedAt)}` : ''}`}
                  aside={<PenScore score={item.score} max={item.maxMarks} size="sm" />}
                />
              ))
            )}
          </section>
        </div>

        <div className="space-y-9">
          <section>
            <PanelTitle to="/examinations" linkLabel="Timetable">Upcoming examinations</PanelTitle>
            <UpcomingExams items={data.upcomingExaminations} />
          </section>
          <section>
            <PanelTitle to="/announcements">Announcements</PanelTitle>
            <AnnouncementList items={data.announcements} />
          </section>
          {latest ? <p className="sr-only">{humanize(latest.examinationType)}</p> : null}
        </div>
      </div>
    </>
  );
}
