import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/api';
import { formatDateTime, formatPercent, formatRelative, humanize, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnnouncementList, Attention, PanelTitle, Quiet, Row, TallyRow, UpcomingExams } from './parts';
import type { ClassMasterDashboard } from './types';

interface ActiveScale {
  id: string;
}

/** The first things to do in an empty class, ticked off from the real data. */
function GettingStarted({ data }: { data: ClassMasterDashboard }) {
  const scale = useQuery({ queryKey: ['grading', 'active'], queryFn: () => get<ActiveScale | null>('/grading/active') });
  const { subjects, teachers, students } = data.people;

  const steps = [
    { done: subjects.total > 0, label: 'Add the subjects the class studies', to: '/subjects' },
    { done: teachers.total > 0, label: 'Create an account for each teacher', to: '/teachers' },
    { done: subjects.total > 0 && subjects.withoutTeacher === 0, label: 'Give every subject a teacher', to: '/teachers' },
    { done: Boolean(scale.data), label: 'Set the grading scale that turns marks into grades', to: '/grading' },
    { done: students.total > 0, label: 'Add the students and give each their Student ID', to: '/students' },
  ];
  const remaining = steps.filter((step) => !step.done);
  if (scale.isPending || remaining.length === 0) return null;
  const next = remaining[0];

  return (
    <section className="ruled margin-line mb-9 rounded-xl border border-border bg-surface py-5 pl-14 pr-5 sm:pl-16">
      <h2 className="text-xl">Getting {data.className} ready</h2>
      <p className="mt-1 text-sm text-muted-foreground">CLASSHUB starts empty. Everything you enter here is what the teachers and students will see.</p>
      <ol className="mt-4 space-y-2.5">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                step.done ? 'border-success bg-success text-white' : 'border-input text-muted-foreground',
              )}
              aria-hidden
            >
              {step.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <Link to={step.to} className={cn('text-[0.9375rem] hover:underline', step.done && 'text-muted-foreground line-through')}>
              {step.label}
              <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
            </Link>
          </li>
        ))}
      </ol>
      {next ? (
        <Button asChild className="mt-5">
          <Link to={next.to}>
            Next: {next.label.charAt(0).toLowerCase() + next.label.slice(1)} <ArrowRight />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}

export function ClassMasterDashboardView({ data }: { data: ClassMasterDashboard }) {
  const { people, examinations, assignments } = data;
  const attention: { count: number; to: string; text: string }[] = [];
  if (examinations.awaitingReview > 0) {
    attention.push({
      count: examinations.awaitingReview,
      to: '/marks-review',
      text: `${pluralize(examinations.awaitingReview, 'mark sheet')} submitted by teachers ${examinations.awaitingReview === 1 ? 'is' : 'are'} waiting for your review`,
    });
  }
  if (examinations.readyToPublish > 0) {
    attention.push({
      count: examinations.readyToPublish,
      to: '/results',
      text: `${pluralize(examinations.readyToPublish, 'examination')} fully approved and ready to publish to students`,
    });
  }
  if (people.subjects.withoutTeacher > 0) {
    attention.push({
      count: people.subjects.withoutTeacher,
      to: '/subjects',
      text: `${pluralize(people.subjects.withoutTeacher, 'subject')} without a teacher`,
    });
  }

  return (
    <>
      <GettingStarted data={data} />

      <TallyRow
        items={[
          { label: 'Students', value: people.students.total, note: `${people.students.active} active`, to: '/students' },
          { label: 'Teachers', value: people.teachers.total, note: `${people.teachers.active} active`, to: '/teachers' },
          { label: 'Subjects', value: people.subjects.total, note: `${people.subjects.active} active`, to: '/subjects' },
          { label: 'Open assignments', value: assignments.open, note: `${examinations.published} ${examinations.published === 1 ? 'result' : 'results'} published`, to: '/assignments' },
        ]}
      />

      {data.lastBackupAt === null ? (
        <Alert tone="warning" title="No backup has been made yet" className="mb-9">
          Everything lives on this computer. <Link to="/backups" className="font-medium text-primary underline underline-offset-2">Make a backup</Link> before you rely on it.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-x-12 gap-y-9 lg:grid-cols-2">
        <div className="space-y-9">
          <section>
            <PanelTitle>Needs your attention</PanelTitle>
            {attention.length === 0 ? <Quiet>Nothing is waiting for you.</Quiet> : <ul>{attention.map((item) => <Attention key={item.to + item.count} count={item.count} to={item.to}>{item.text}</Attention>)}</ul>}
          </section>

          <section>
            <PanelTitle to="/examinations">Upcoming examinations</PanelTitle>
            <UpcomingExams items={data.upcomingExaminations} />
          </section>

          <section>
            <PanelTitle to="/announcements">Announcements</PanelTitle>
            <AnnouncementList items={data.announcements} />
          </section>
        </div>

        <div className="space-y-9">
          <section>
            <PanelTitle to="/results">Latest published results</PanelTitle>
            {data.latestResults.length === 0 ? (
              <Quiet>No results have been published yet.</Quiet>
            ) : (
              data.latestResults.map((result) => (
                <Row
                  key={result.examinationId}
                  to="/results"
                  title={result.name}
                  detail={`${pluralize(result.students, 'student')} ranked`}
                  aside={
                    <span>
                      <span className="font-medium">{formatPercent(result.average)}</span> average
                      <span className="block text-[0.8125rem] text-muted-foreground">{formatPercent(result.passRate)} passed</span>
                    </span>
                  }
                />
              ))
            )}
          </section>

          <section>
            <PanelTitle to="/audit-log">Recent activity</PanelTitle>
            {data.recentActivity.length === 0 ? (
              <Quiet>Nothing has happened yet.</Quiet>
            ) : (
              data.recentActivity.map((event) => (
                <Row key={event.id} title={event.summary} detail={`${event.actorName}, ${formatRelative(event.createdAt)}`} aside={<span className="text-[0.8125rem] text-muted-foreground">{humanize(event.action)}</span>} />
              ))
            )}
          </section>

          {data.lastBackupAt ? (
            <p className="text-sm text-muted-foreground">
              Last backup: <span className="font-medium text-foreground">{formatDateTime(data.lastBackupAt)}</span> ({formatRelative(data.lastBackupAt)}).
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
