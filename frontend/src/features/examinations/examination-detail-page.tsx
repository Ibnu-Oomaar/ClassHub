import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardPen, Eye, Pencil, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Section } from '@/components/page-header';
import { QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { del, get } from '@/lib/api';
import { formatDate, formatDateTime, formatScore, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { ExaminationFormDialog } from './examination-form-dialog';
import type { Examination } from './types';

export default function ExaminationDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const isTeacher = me.role === 'TEACHER';
  const isStudent = me.role === 'STUDENT';
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery({ queryKey: [...keys.examinations, 'one', id], queryFn: () => get<Examination>(`/examinations/${id}`) });

  const remove = useAction({
    run: () => del(`/examinations/${id}`),
    refresh: [keys.examinations, keys.marks, keys.results, keys.dashboard],
    success: 'The examination is deleted.',
    onSuccess: () => navigate('/examinations', { replace: true }),
  });

  return (
    <>
      <Link to="/examinations" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" /> {isStudent ? 'Exam timetable' : 'All examinations'}
      </Link>

      <QueryState query={query} skeleton={<RowsSkeleton rows={5} />}>
        {(exam) => {
          const approved = exam.subjects.filter((subject) => subject.marksStatus === 'APPROVED').length;
          const readyToPublish = isClassMaster && exam.subjects.length > 0 && approved === exam.subjects.length && !exam.resultsPublished;
          const showMarks = !isStudent;

          return (
            <>
              <header className="mb-7 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[1.75rem] sm:text-[2.1rem]">{exam.name}</h1>
                  <p className="mt-1.5 text-muted-foreground">
                    {humanize(exam.type)} on {formatDate(exam.examDate)}
                    {exam.academicPeriod ? `, ${exam.academicPeriod}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={exam.status} />
                    {exam.resultsPublished ? <Badge tone="success">Results published</Badge> : null}
                  </div>
                </div>
                {isClassMaster ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="outline" onClick={() => setDeleting(true)}>
                      <Trash2 className="text-pen" /> Delete
                    </Button>
                  </div>
                ) : null}
              </header>

              {exam.status === 'CANCELLED' ? (
                <Alert tone="warning" title="This examination is cancelled" className="mb-6">
                  Marks cannot be entered for a cancelled examination.
                </Alert>
              ) : null}
              {exam.status === 'DRAFT' ? (
                <Alert tone="info" title="This examination is a draft" className="mb-6">
                  Only you can see it. Change its status to Scheduled so teachers can enter marks and students can see the date.
                </Alert>
              ) : null}
              {readyToPublish ? (
                <Alert tone="success" title="Every subject is approved" className="mb-6">
                  <Link to={`/results/${exam.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2">
                    <Trophy className="size-4" /> Review the standings and publish the results
                  </Link>
                </Alert>
              ) : null}

              {exam.instructions ? (
                <Section title="Instructions">
                  <p className="max-w-prose whitespace-pre-line">{exam.instructions}</p>
                </Section>
              ) : null}

              <Section
                title={isStudent ? 'What it covers' : 'Subjects'}
                description={
                  isClassMaster
                    ? `${approved} of ${exam.subjects.length} mark sheets approved.`
                    : isTeacher
                      ? 'Enter marks for the subjects you teach.'
                      : undefined
                }
              >
                {exam.subjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isTeacher ? 'None of your subjects are part of this examination.' : 'No subjects.'}</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Subject</TH>
                        <TH className="text-right">Out of</TH>
                        {showMarks ? <TH>Marks</TH> : null}
                        {showMarks ? <TH>Last change</TH> : null}
                        {showMarks ? <TH className="text-right">Sheet</TH> : null}
                      </TR>
                    </THead>
                    <TBody>
                      {exam.subjects.map((subject) => {
                        const editable = isTeacher && (subject.marksStatus === 'PENDING' || subject.marksStatus === 'DRAFT' || subject.marksStatus === 'REJECTED') && (exam.status === 'SCHEDULED' || exam.status === 'COMPLETED');
                        return (
                          <TR key={subject.id}>
                            <TD>
                              <p className="font-medium">{subject.subjectName}</p>
                              {subject.subjectCode ? <p className="text-[0.8125rem] text-muted-foreground">{subject.subjectCode}</p> : null}
                              {isTeacher && subject.marksStatus === 'REJECTED' && subject.reviewFeedback ? (
                                <p className="mt-1 max-w-md text-[0.8125rem] text-pen">Sent back: {subject.reviewFeedback}</p>
                              ) : null}
                            </TD>
                            <TD className="text-right tabular-nums">{formatScore(subject.maxMarks)}</TD>
                            {showMarks ? <TD>{subject.marksStatus ? <StatusBadge status={subject.marksStatus} /> : null}</TD> : null}
                            {showMarks ? (
                              <TD className="whitespace-nowrap text-[0.8125rem] text-muted-foreground">
                                {subject.reviewedAt ? `Reviewed ${formatDateTime(subject.reviewedAt)}` : subject.submittedAt ? `Submitted ${formatDateTime(subject.submittedAt)}` : '-'}
                              </TD>
                            ) : null}
                            {showMarks ? (
                              <TD>
                                <div className="flex justify-end">
                                  <Button variant={editable ? 'default' : 'outline'} size="sm" asChild>
                                    <Link to={`/marks/${subject.id}`}>
                                      {editable ? <ClipboardPen /> : <Eye />}
                                      {editable ? 'Enter marks' : 'Open sheet'}
                                    </Link>
                                  </Button>
                                </div>
                              </TD>
                            ) : null}
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </Section>

              {isClassMaster ? <ExaminationFormDialog open={editing} onOpenChange={setEditing} examination={exam} /> : null}
              <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title={`Delete ${exam.name}?`}
                description="Only an examination with no marks entered can be deleted. Once teachers have entered marks, set its status to Cancelled instead."
                confirmLabel="Delete examination"
                tone="danger"
                pending={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            </>
          );
        }}
      </QueryState>
    </>
  );
}
