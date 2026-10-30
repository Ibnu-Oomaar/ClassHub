import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { formatDate, formatRelative, pluralize } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';
import { AnnouncementList, Attention, PanelTitle, Quiet, Row, TallyRow, UpcomingExams } from './parts';
import type { TeacherDashboard } from './types';

export function TeacherDashboardView({ data }: { data: TeacherDashboard }) {
  const { marks, assignments } = data;
  const attention: { count: number; to: string; text: string }[] = [];
  if (marks.rejected > 0) {
    attention.push({ count: marks.rejected, to: '/examinations', text: `${pluralize(marks.rejected, 'mark sheet')} sent back by the Class Master for correction` });
  }
  if (marks.toEnter > 0) {
    attention.push({ count: marks.toEnter, to: '/examinations', text: `${pluralize(marks.toEnter, 'mark sheet')} still to fill in and submit` });
  }
  if (assignments.submissionsToGrade > 0) {
    attention.push({ count: assignments.submissionsToGrade, to: '/assignments', text: `${pluralize(assignments.submissionsToGrade, 'student submission')} waiting to be graded` });
  }

  return (
    <>
      {data.subjects.length === 0 ? (
        <Alert tone="info" title="You have no subject yet" className="mb-9">
          The Class Master has not assigned a subject to you. Once they do, your exams, marks and assignments appear here.
        </Alert>
      ) : (
        <p className="-mt-3 mb-7 text-muted-foreground">
          You teach <span className="font-medium text-foreground">{data.subjects.map((subject) => subject.name).join(', ')}</span>.
        </p>
      )}

      <TallyRow
        items={[
          { label: 'Marks to enter', value: marks.toEnter + marks.rejected, note: marks.rejected > 0 ? `${marks.rejected} sent back` : 'none sent back', to: '/examinations' },
          { label: 'Awaiting review', value: marks.awaitingReview, note: 'with the Class Master', to: '/examinations' },
          { label: 'Approved sheets', value: marks.approved, to: '/examinations' },
          { label: 'To grade', value: assignments.submissionsToGrade, note: `${assignments.open} open ${assignments.open === 1 ? 'assignment' : 'assignments'}`, to: '/assignments' },
        ]}
      />

      <div className="grid grid-cols-1 gap-x-12 gap-y-9 lg:grid-cols-2">
        <div className="space-y-9">
          <section>
            <PanelTitle>Needs your attention</PanelTitle>
            {attention.length === 0 ? <Quiet>Nothing is waiting for you.</Quiet> : <ul>{attention.map((item) => <Attention key={item.text} count={item.count} to={item.to}>{item.text}</Attention>)}</ul>}
          </section>

          <section>
            <PanelTitle to="/examinations" linkLabel="All exams">Marks to do</PanelTitle>
            {data.marksToDo.length === 0 ? (
              <Quiet>No mark sheets are waiting for you.</Quiet>
            ) : (
              data.marksToDo.map((item) => (
                <Row
                  key={item.examinationSubjectId}
                  to={`/marks/${item.examinationSubjectId}`}
                  title={`${item.subjectName}: ${item.examinationName}`}
                  detail={`Exam on ${formatDate(item.examDate)}`}
                  aside={<StatusBadge status={item.marksStatus} />}
                />
              ))
            )}
          </section>

          <section>
            <PanelTitle to="/assignments">Assignments to grade</PanelTitle>
            {data.assignmentsToGrade.length === 0 ? (
              <Quiet>Every submission is graded.</Quiet>
            ) : (
              data.assignmentsToGrade.map((item) => (
                <Row
                  key={item.assignmentId}
                  to={`/assignments/${item.assignmentId}`}
                  title={item.title}
                  detail={`${item.subjectName}, due ${formatRelative(item.dueAt)}`}
                  aside={<span className="font-medium">{item.ungraded} to grade</span>}
                />
              ))
            )}
          </section>
        </div>

        <div className="space-y-9">
          <section>
            <PanelTitle to="/examinations">Upcoming examinations</PanelTitle>
            <UpcomingExams items={data.upcomingExaminations} />
          </section>
          <section>
            <PanelTitle to="/announcements">Announcements</PanelTitle>
            <AnnouncementList items={data.announcements} />
          </section>
          <p className="text-sm text-muted-foreground">
            Need to change your password? Open <Link to="/profile" className="font-medium text-primary hover:underline">My account</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
