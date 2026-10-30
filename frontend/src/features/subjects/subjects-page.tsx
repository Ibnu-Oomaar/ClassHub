import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BookMarked, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { QueryState, RowsSkeleton, EmptyState } from '@/components/states';
import { SearchInput } from '@/components/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { TeacherSubjectsManager } from '@/features/teacher-subjects/teacher-subjects-manager';
import { del, getPage } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { useListParams } from '@/lib/use-list-params';
import { SubjectFormDialog } from './subject-form-dialog';
import type { Subject } from './types';

const DEFAULTS = { search: '', filter: 'all' };

export default function SubjectsPage() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [teachersOf, setTeachersOf] = useState<Subject | null>(null);
  const [removing, setRemoving] = useState<Subject | null>(null);

  const query = useQuery({
    queryKey: [...keys.subjects, 'list', values, page],
    queryFn: () =>
      getPage<Subject>('/subjects', {
        page,
        limit: 20,
        search: values.search,
        isActive: values.filter === 'active' ? true : values.filter === 'inactive' ? false : undefined,
        unassignedOnly: values.filter === 'unassigned' ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const remove = useAction({
    run: (subject: Subject) => del(`/subjects/${subject.id}`),
    refresh: [keys.subjects, keys.teacherSubjects, keys.dashboard],
    success: 'The subject is removed.',
    onSuccess: () => setRemoving(null),
  });

  const filtered = values.search !== '' || values.filter !== 'all';

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The subjects 3C Morning Boys studies. A subject needs a teacher before marks can be entered for it."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add subject
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={values.search} onChange={(search) => update({ search })} placeholder="Search subjects" className="sm:w-72" />
        <Select value={values.filter} onChange={(event) => update({ filter: event.target.value })} aria-label="Show" className="sm:w-56">
          <option value="all">All subjects</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="unassigned">Without a teacher</option>
        </Select>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={6} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          filtered ? (
            <EmptyState icon={<BookMarked />} title="No subject matches" description="Try a different search or show all subjects." action={<Button variant="outline" onClick={() => update({ search: '', filter: 'all' })}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={<BookMarked />}
              title="No subjects yet"
              description="Add the subjects your class studies. They are not pre-filled, so the list is exactly what you enter."
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus /> Add the first subject
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Subject</TH>
                  <TH>Teacher</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((subject) => (
                  <TR key={subject.id}>
                    <TD>
                      <p className="font-medium">{subject.name}</p>
                      {subject.code ? <p className="text-[0.8125rem] text-muted-foreground">{subject.code}</p> : null}
                    </TD>
                    <TD>
                      {subject.teachers.length === 0 ? (
                        <Badge tone="warning">Not assigned</Badge>
                      ) : (
                        <span>{subject.teachers.map((teacher) => teacher.teacherName).join(', ')}</span>
                      )}
                    </TD>
                    <TD>{subject.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Tooltip label="Assign teachers">
                          <Button variant="ghost" size="icon-sm" aria-label={`Teachers of ${subject.name}`} onClick={() => setTeachersOf(subject)}>
                            <Users />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${subject.name}`}
                            onClick={() => {
                              setEditing(subject);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${subject.name}`} onClick={() => setRemoving(subject)}>
                            <Trash2 className="text-pen" />
                          </Button>
                        </Tooltip>
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

      <SubjectFormDialog open={formOpen} onOpenChange={setFormOpen} subject={editing} />

      <Dialog open={teachersOf !== null} onOpenChange={(open) => !open && setTeachersOf(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Teachers of {teachersOf?.name}</DialogTitle>
            <DialogDescription>A teacher can enter marks and set assignments only for the subjects assigned to them.</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-6">{teachersOf ? <TeacherSubjectsManager scope={{ kind: 'subject', subjectId: teachersOf.id }} /> : null}</DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete ${removing?.name ?? 'subject'}?`}
        description="Only a subject with no teacher, exams or assignments can be deleted. Otherwise mark it inactive to keep its history."
        confirmLabel="Delete subject"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}
