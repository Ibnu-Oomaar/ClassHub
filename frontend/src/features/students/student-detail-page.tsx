import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileBarChart, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { Avatar } from '@/components/avatar';
import { QueryState, RowsSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/api';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { StudentFormDialog } from './student-form-dialog';
import type { StudentProfile } from './types';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{children}</dd>
    </div>
  );
}

export default function StudentDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const isClassMaster = me.role === 'CLASS_MASTER';
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: [...keys.students, 'one', id], queryFn: () => get<StudentProfile>(`/students/${id}`) });

  return (
    <>
      <Link to="/students" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" /> All students
      </Link>

      <QueryState query={query} skeleton={<RowsSkeleton rows={5} />}>
        {(student) => (
          <>
            <header className="mb-7 flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={student.fullName} photoUrl={student.hasPhoto ? `/students/${student.id}/photo` : null} className="size-20 text-2xl" />
                <div className="min-w-0">
                  <h1 className="text-[1.75rem] sm:text-[2.1rem]">{student.fullName}</h1>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>Student ID {student.studentId}</span>
                    {student.deletedAt ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={student.status} />}
                  </p>
                </div>
              </div>
              {isClassMaster && !student.deletedAt ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link to={`/reports?report=student-performance&studentId=${student.id}`}>
                      <FileBarChart /> Performance report
                    </Link>
                  </Button>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil /> Edit details
                  </Button>
                </div>
              ) : null}
            </header>

            {student.deletedAt ? (
              <Alert tone="warning" title="This student was removed" className="mb-6">
                They cannot sign in and are not in the class lists. Restore them from the Students page (Removed students) to bring them back.
              </Alert>
            ) : null}

            <dl className="max-w-3xl border-t border-border">
              <Detail label="Gender">{student.gender ? humanize(student.gender) : 'Not stated'}</Detail>
              <Detail label="Joined the class">{formatDate(student.registeredAt)}</Detail>
              {isClassMaster ? (
                <>
                  <Detail label="Date of birth">{student.dateOfBirth ? formatDate(student.dateOfBirth) : 'Not stated'}</Detail>
                  <Detail label="Phone">{student.phone ?? 'Not stated'}</Detail>
                  <Detail label="Email">{student.email ?? 'Not stated'}</Detail>
                  <Detail label="Address">{student.address ?? 'Not stated'}</Detail>
                  <Detail label="Private notes">{student.notes ?? 'None'}</Detail>
                  <Detail label="Last signed in">{student.lastLoginAt ? formatDateTime(student.lastLoginAt) : 'Has not signed in yet'}</Detail>
                </>
              ) : null}
            </dl>

            {isClassMaster ? <StudentFormDialog open={editing} onOpenChange={setEditing} studentRecordId={student.id} /> : null}
          </>
        )}
      </QueryState>
    </>
  );
}
