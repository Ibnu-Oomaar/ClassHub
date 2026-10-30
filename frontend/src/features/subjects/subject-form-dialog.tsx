import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { patch, post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { Subject } from './types';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the subject name.').max(100, 'Use at most 100 characters.'),
  code: z
    .string()
    .trim()
    .max(20, 'Use at most 20 characters.')
    .refine((value) => value === '' || /^[A-Za-z0-9._-]+$/.test(value), 'Use letters, numbers, dot, dash or underscore only.'),
  description: z.string().trim().max(500, 'Use at most 500 characters.'),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: '', code: '', description: '', isActive: true };

export function SubjectFormDialog({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (open: boolean) => void; subject: Subject | null }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) {
      reset(subject ? { name: subject.name, code: subject.code ?? '', description: subject.description ?? '', isActive: subject.isActive } : EMPTY);
    }
  }, [open, subject, reset]);

  const save = useAction({
    run: (values: Values) => {
      const body = { name: values.name, code: values.code || null, description: values.description || null, isActive: values.isActive };
      return subject ? patch<Subject>(`/subjects/${subject.id}`, body) : post<Subject>('/subjects', body);
    },
    refresh: [keys.subjects, keys.dashboard],
    success: (saved) => (subject ? `${saved.name} is updated.` : `${saved.name} is added.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{subject ? 'Edit subject' : 'Add a subject'}</DialogTitle>
            <DialogDescription>{subject ? 'Changes show everywhere the subject is used.' : 'Add the subjects this class studies, one at a time.'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <Field label="Subject name" htmlFor="subject-name" error={errors.name?.message} required>
              <Input id="subject-name" autoFocus placeholder="For example Physics" aria-invalid={!!errors.name} {...register('name')} />
            </Field>
            <Field label="Short code" htmlFor="subject-code" error={errors.code?.message} hint="Optional. Used on reports, for example PHY.">
              <Input id="subject-code" autoCapitalize="characters" aria-invalid={!!errors.code} {...register('code')} />
            </Field>
            <Field label="Description" htmlFor="subject-description" error={errors.description?.message}>
              <Textarea id="subject-description" rows={3} aria-invalid={!!errors.description} {...register('description')} />
            </Field>
            {subject ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="font-medium">Active</p>
                  <p className="text-sm text-muted-foreground">Inactive subjects cannot be used in new exams or assignments.</p>
                </div>
                <Switch checked={watch('isActive')} onCheckedChange={(checked) => setValue('isActive', checked, { shouldDirty: true })} aria-label="Subject is active" />
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {subject ? 'Save changes' : 'Add subject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
