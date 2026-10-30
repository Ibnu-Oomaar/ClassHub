import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { QueryState, Spinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import type { Subject } from '@/features/subjects/types';
import type { TeacherSummary } from '@/features/teachers/types';
import { del, getPage, post } from '@/lib/api';
import { useAction } from '@/lib/use-action';
import { keys } from '@/lib/query-keys';
import type { TeacherSubjectAssignment } from './types';

type Scope = { kind: 'subject'; subjectId: string } | { kind: 'teacher'; teacherId: string };

/**
 * Who teaches what. From a subject it lists the teachers and lets the Class Master add or remove one;
 * from a teacher it does the same with subjects. Both write to the same assignments.
 */
export function TeacherSubjectsManager({ scope }: { scope: Scope }) {
  const [choice, setChoice] = useState('');
  const filter = scope.kind === 'subject' ? { subjectId: scope.subjectId } : { teacherId: scope.teacherId };

  const assigned = useQuery({
    queryKey: [...keys.teacherSubjects, filter],
    queryFn: async () => (await getPage<TeacherSubjectAssignment>('/teacher-subjects', { ...filter, limit: 200 })).items,
  });

  const options = useQuery({
    queryKey: scope.kind === 'subject' ? [...keys.teachers, 'options'] : [...keys.subjects, 'options'],
    queryFn: async () =>
      scope.kind === 'subject'
        ? (await getPage<TeacherSummary>('/teachers', { limit: 200, status: 'ACTIVE' })).items.map((teacher) => ({ id: teacher.id, label: teacher.fullName }))
        : (await getPage<Subject>('/subjects', { limit: 200, isActive: true })).items.map((subject) => ({ id: subject.id, label: subject.name })),
  });

  const refresh = [keys.teacherSubjects, keys.subjects, keys.teachers, keys.dashboard];

  const add = useAction({
    run: () => post('/teacher-subjects', scope.kind === 'subject' ? { subjectId: scope.subjectId, teacherId: choice } : { teacherId: scope.teacherId, subjectId: choice }),
    refresh,
    success: 'Assigned.',
    onSuccess: () => setChoice(''),
  });

  const remove = useAction({
    run: (assignmentId: string) => del(`/teacher-subjects/${assignmentId}`),
    refresh,
    success: 'Removed.',
  });

  const takenIds = new Set((assigned.data ?? []).map((item) => (scope.kind === 'subject' ? item.teacherId : item.subjectId)));
  const available = (options.data ?? []).filter((option) => !takenIds.has(option.id));
  const noun = scope.kind === 'subject' ? 'teacher' : 'subject';

  return (
    <div>
      <QueryState
        query={assigned}
        isEmpty={(items) => items.length === 0}
        empty={<p className="rounded-lg border border-dashed border-input px-4 py-5 text-sm text-muted-foreground">{scope.kind === 'subject' ? 'No teacher is assigned to this subject yet.' : 'This teacher has no subject yet.'}</p>}
        skeleton={<div className="h-16 animate-pulse rounded-lg bg-subtle" />}
      >
        {(items) => (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate font-medium">
                  {scope.kind === 'subject' ? item.teacherName : item.subjectName}
                  {(scope.kind === 'subject' ? !item.teacherActive : !item.subjectActive) ? <span className="ml-2 text-xs font-normal text-muted-foreground">inactive</span> : null}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${scope.kind === 'subject' ? item.teacherName : item.subjectName}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (choice) add.mutate();
        }}
      >
        <Select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label={`Choose a ${noun}`} disabled={options.isPending || available.length === 0}>
          <option value="">{options.isPending ? 'Loading' : available.length === 0 ? `No more ${noun}s to add` : `Choose a ${noun}`}</option>
          {available.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={!choice || add.isPending}>
          {add.isPending ? <Spinner /> : <Plus />}
          Assign
        </Button>
      </form>
      {options.isError ? <p className="mt-2 text-sm text-pen">{options.error.message}</p> : null}
    </div>
  );
}
