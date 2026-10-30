import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Paperclip, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useMe } from '@/auth/auth-context';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { UploadField, type UploadedItem } from '@/components/upload-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { Subject } from '@/features/subjects/types';
import { getPage, patch, post } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { MAX_ASSIGNMENT_ATTACHMENTS, type Assignment } from './types';

const schema = z.object({
  subjectId: z.string().min(1, 'Choose the subject.'),
  title: z.string().trim().min(2, 'Enter a title.').max(200, 'Use at most 200 characters.'),
  description: z.string().trim().max(8000, 'Use at most 8000 characters.'),
  dueAt: z.string().min(1, 'Choose the deadline.'),
  maxMarks: z
    .string()
    .trim()
    .min(1, 'Enter the maximum marks.')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 1000, 'Use a number from 1 to 1000.')
    .refine((value) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-6, 'At most 2 decimals.'),
  isAvailable: z.boolean(),
  allowLateSubmissions: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { subjectId: '', title: '', description: '', dueAt: '', maxMarks: '10', isAvailable: true, allowLateSubmissions: false };

export function AssignmentFormDialog({ open, onOpenChange, assignment }: { open: boolean; onOpenChange: (open: boolean) => void; assignment: Assignment | null }) {
  const me = useMe();
  const editing = assignment !== null;

  const subjects = useQuery({
    queryKey: [...keys.subjects, 'mine', me.teacherProfileId],
    queryFn: async () => (await getPage<Subject>('/subjects', { teacherId: me.teacherProfileId, isActive: true, limit: 200 })).items,
    enabled: open && !editing,
  });

  const [added, setAdded] = useState<UploadedItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    setAdded([]);
    setRemoved([]);
    if (assignment) {
      reset({
        subjectId: assignment.subjectId,
        title: assignment.title,
        description: assignment.description ?? '',
        dueAt: format(new Date(assignment.dueAt), "yyyy-MM-dd'T'HH:mm"),
        maxMarks: String(assignment.maxMarks),
        isAvailable: assignment.isAvailable,
        allowLateSubmissions: assignment.allowLateSubmissions,
      });
    } else {
      reset(EMPTY);
    }
  }, [open, assignment, reset]);

  const kept = (assignment?.attachments ?? []).filter((file) => !removed.includes(file.fileId));
  const attachmentCount = kept.length + added.length;

  const save = useAction({
    run: (values: Values) => {
      const common = {
        title: values.title,
        description: values.description || null,
        dueAt: new Date(values.dueAt).toISOString(),
        maxMarks: Number(values.maxMarks),
        isAvailable: values.isAvailable,
        allowLateSubmissions: values.allowLateSubmissions,
      };
      if (assignment) {
        return patch<Assignment>(`/assignments/${assignment.id}`, {
          ...common,
          ...(added.length > 0 ? { addAttachmentFileIds: added.map((file) => file.id) } : {}),
          ...(removed.length > 0 ? { removeAttachmentFileIds: removed } : {}),
        });
      }
      return post<Assignment>('/assignments', { ...common, subjectId: values.subjectId, attachmentFileIds: added.map((file) => file.id) });
    },
    refresh: [keys.assignments, keys.dashboard],
    success: (saved) => (editing ? `${saved.title} is updated.` : saved.isAvailable ? `${saved.title} is published to the class.` : `${saved.title} is saved as hidden.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit assignment' : 'New assignment'}</DialogTitle>
            <DialogDescription>Students see it as soon as it is available. You grade what they hand in.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}

            {!editing ? (
              subjects.isError ? (
                <Alert tone="danger">{subjects.error.message}</Alert>
              ) : (
                <Field label="Subject" htmlFor="assignment-subject" error={errors.subjectId?.message} required>
                  <Select id="assignment-subject" disabled={subjects.isPending} aria-invalid={!!errors.subjectId} {...register('subjectId')}>
                    <option value="">{subjects.isPending ? 'Loading' : 'Choose a subject'}</option>
                    {(subjects.data ?? []).map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Subject: <span className="font-medium text-foreground">{assignment?.subjectName}</span>
              </p>
            )}
            {!editing && subjects.data && subjects.data.length === 0 ? (
              <Alert tone="warning" title="You have no subject yet">
                The Class Master has to assign a subject to you before you can set assignments. <Link to="/dashboard" className="font-medium text-primary underline underline-offset-2">Back to home</Link>
              </Alert>
            ) : null}

            <Field label="Title" htmlFor="assignment-title" error={errors.title?.message} required>
              <Input id="assignment-title" autoFocus={editing} aria-invalid={!!errors.title} {...register('title')} />
            </Field>
            <Field label="Instructions" htmlFor="assignment-description" error={errors.description?.message}>
              <Textarea id="assignment-description" rows={5} aria-invalid={!!errors.description} {...register('description')} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Deadline" htmlFor="assignment-due" error={errors.dueAt?.message} required>
                <Input id="assignment-due" type="datetime-local" aria-invalid={!!errors.dueAt} {...register('dueAt')} />
              </Field>
              <Field label="Maximum marks" htmlFor="assignment-max" error={errors.maxMarks?.message} required>
                <Input id="assignment-max" inputMode="decimal" className="tabular-nums" aria-invalid={!!errors.maxMarks} {...register('maxMarks')} />
              </Field>
            </div>

            <div className="space-y-3 rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Visible to students</p>
                  <p className="text-sm text-muted-foreground">Turn off to keep it hidden while you prepare it, or to stop new hand-ins.</p>
                </div>
                <Switch checked={watch('isAvailable')} onCheckedChange={(checked) => setValue('isAvailable', checked, { shouldDirty: true })} aria-label="Visible to students" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <div>
                  <p className="font-medium">Accept late work</p>
                  <p className="text-sm text-muted-foreground">After the deadline students can still hand in, marked as late.</p>
                </div>
                <Switch checked={watch('allowLateSubmissions')} onCheckedChange={(checked) => setValue('allowLateSubmissions', checked, { shouldDirty: true })} aria-label="Accept late work" />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Files for students</p>
              {kept.length > 0 ? (
                <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
                  {kept.map((file) => (
                    <li key={file.fileId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={() => setRemoved((current) => [...current, file.fileId])}>
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <UploadField
                category="ASSIGNMENT_ATTACHMENT"
                items={added}
                onChange={setAdded}
                max={Math.max(MAX_ASSIGNMENT_ATTACHMENTS - kept.length, 0)}
                label="Add a file"
                hint={`Up to ${MAX_ASSIGNMENT_ATTACHMENTS} files (PDF, Office, text, image or ZIP). ${attachmentCount} attached.`}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {editing ? 'Save changes' : 'Create assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
