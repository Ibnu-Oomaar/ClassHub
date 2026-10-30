import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DownloadButton } from '@/components/download-button';
import { Section } from '@/components/page-header';
import { QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { del, get, patch } from '@/lib/api';
import { formatBytes, formatDateTime, formatRelative, formatScore } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { AssignmentFormDialog } from './assignment-form-dialog';
import { MySubmissionPanel } from './my-submission-panel';
import { OverviewPanel } from './overview-panel';
import type { Assignment } from './types';

export default function AssignmentDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const isTeacher = me.role === 'TEACHER';
  const isStudent = me.role === 'STUDENT';
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery({ queryKey: [...keys.assignments, 'one', id], queryFn: () => get<Assignment>(`/assignments/${id}`) });

  const refresh = [keys.assignments, keys.submissions, keys.dashboard];
  const availability = useAction({
    run: (isAvailable: boolean) => patch<Assignment>(`/assignments/${id}/availability`, { isAvailable }),
    refresh,
    success: (saved) => (saved.isAvailable ? 'Students can see this assignment again.' : 'The assignment is hidden from students.'),
  });
  const remove = useAction({
    run: () => del(`/assignments/${id}`),
    refresh,
    success: 'The assignment is deleted.',
    onSuccess: () => navigate('/assignments', { replace: true }),
  });

  return (
    <>
      <Link to="/assignments" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" /> All assignments
      </Link>

      <QueryState query={query} skeleton={<RowsSkeleton rows={5} />}>
        {(assignment) => (
          <>
            <header className="mb-7 flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-[1.75rem] sm:text-[2.1rem]">{assignment.title}</h1>
                <p className="mt-1.5 text-muted-foreground">
                  {assignment.subjectName}, set by {assignment.teacherName}, out of {formatScore(assignment.maxMarks)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={assignment.state} />
                  {!isStudent && !assignment.isAvailable ? <Badge>Hidden from students</Badge> : null}
                  {assignment.allowLateSubmissions ? <Badge>Late work accepted</Badge> : null}
                </div>
                <p className="mt-3 text-[0.9375rem]">
                  Deadline <span className="font-semibold">{formatDateTime(assignment.dueAt)}</span>
                  <span className="text-muted-foreground"> ({formatRelative(assignment.dueAt)})</span>
                </p>
              </div>
              {!isStudent ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={availability.isPending} onClick={() => availability.mutate(!assignment.isAvailable)}>
                    {assignment.isAvailable ? <EyeOff /> : <Eye />}
                    {assignment.isAvailable ? 'Hide from students' : 'Show to students'}
                  </Button>
                  {isTeacher ? (
                    <>
                      <Button variant="outline" onClick={() => setEditing(true)}>
                        <Pencil /> Edit
                      </Button>
                      <Button variant="outline" onClick={() => setDeleting(true)}>
                        <Trash2 className="text-pen" /> Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </header>

            {assignment.description ? (
              <Section title="Instructions">
                <p className="max-w-prose whitespace-pre-line break-words">{assignment.description}</p>
              </Section>
            ) : null}

            {assignment.attachments.length > 0 ? (
              <Section title="Files from the teacher">
                <ul className="max-w-xl divide-y divide-border rounded-lg border border-border">
                  {assignment.attachments.map((file) => (
                    <li key={file.fileId} className="flex items-center gap-3 px-4 py-2.5">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{file.name}</p>
                        <p className="text-[0.8125rem] text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
                      </div>
                      <DownloadButton url={`/assignments/${assignment.id}/attachments/${file.fileId}`} fallbackName={file.name} size="sm">
                        Download
                      </DownloadButton>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {isStudent ? (
              <Section title="My work">
                <MySubmissionPanel assignment={assignment} />
              </Section>
            ) : (
              <Section title="Hand-ins" description={isTeacher ? 'Open a student’s work to grade it.' : 'Read-only. Only the subject teacher grades.'}>
                {!assignment.isAvailable ? (
                  <Alert tone="info" className="mb-4">
                    This assignment is hidden, so students cannot hand work in. Work already handed in is shown below.
                  </Alert>
                ) : null}
                <OverviewPanel assignmentId={assignment.id} canGrade={isTeacher} />
              </Section>
            )}

            {isTeacher ? (
              <>
                <AssignmentFormDialog open={editing} onOpenChange={setEditing} assignment={assignment} />
                <ConfirmDialog
                  open={deleting}
                  onOpenChange={setDeleting}
                  title={`Delete ${assignment.title}?`}
                  description="This removes the assignment and its files. An assignment that students have already handed work in for cannot be deleted: hide it instead."
                  confirmLabel="Delete assignment"
                  tone="danger"
                  pending={remove.isPending}
                  onConfirm={() => remove.mutate()}
                />
              </>
            ) : null}
          </>
        )}
      </QueryState>
    </>
  );
}
