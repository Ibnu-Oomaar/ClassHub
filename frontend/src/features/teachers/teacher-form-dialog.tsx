import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { PhotoPicker } from '@/components/photo-picker';
import { ErrorState, Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { get, patch, post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { TeacherProfile } from './types';

const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use at most 128 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.');

function buildSchema(editing: boolean) {
  return z
    .object({
      fullName: z.string().trim().min(2, 'Enter the full name.').max(150, 'Use at most 150 characters.'),
      username: z
        .string()
        .trim()
        .max(60, 'Use at most 60 characters.')
        .refine((value) => value === '' || value.length >= 3, 'Use at least 3 characters.')
        .refine((value) => value === '' || /^[A-Za-z0-9._-]+$/.test(value), 'Use letters, numbers, dot, underscore or dash only.'),
      email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
      password: editing ? passwordRule.or(z.literal('')) : passwordRule,
      gender: z.enum(['', 'MALE', 'FEMALE']),
      phone: z
        .string()
        .trim()
        .refine((value) => value === '' || /^[0-9+()\-\s.]{5,40}$/.test(value), 'Use digits, spaces and + ( ) - . only.'),
      qualification: z.string().trim().max(255, 'Use at most 255 characters.'),
      address: z.string().trim().max(500, 'Use at most 500 characters.'),
      notes: z.string().trim().max(2000, 'Use at most 2000 characters.'),
      status: z.enum(['ACTIVE', 'SUSPENDED']),
    })
    .refine((values) => values.username !== '' || values.email !== '', {
      path: ['username'],
      message: 'Give the teacher a username or an email to sign in with.',
    });
}
type Values = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: Values = { fullName: '', username: '', email: '', password: '', gender: '', phone: '', qualification: '', address: '', notes: '', status: 'ACTIVE' };

function toValues(teacher: TeacherProfile): Values {
  return {
    fullName: teacher.fullName,
    username: teacher.username ?? '',
    email: teacher.email ?? '',
    password: '',
    gender: teacher.gender ?? '',
    phone: teacher.phone ?? '',
    qualification: teacher.qualification ?? '',
    address: teacher.address ?? '',
    notes: teacher.notes ?? '',
    status: teacher.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
  };
}

export function TeacherFormDialog({
  open,
  onOpenChange,
  teacherRecordId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherRecordId: string | null;
}) {
  const editing = teacherRecordId !== null;
  const record = useQuery({
    queryKey: [...keys.teachers, 'one', teacherRecordId],
    queryFn: () => get<TeacherProfile>(`/teachers/${teacherRecordId}`),
    enabled: open && editing,
  });

  const [photoId, setPhotoId] = useState<string | null | undefined>(undefined);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(buildSchema(editing)), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    setPhotoId(undefined);
    if (!editing) reset(EMPTY);
  }, [open, editing, reset]);

  useEffect(() => {
    if (open && record.data) reset(toValues(record.data));
  }, [open, record.data, reset]);

  const save = useAction({
    run: (values: Values) => {
      const body = {
        fullName: values.fullName,
        username: values.username || null,
        email: values.email || null,
        gender: values.gender || null,
        phone: values.phone || null,
        qualification: values.qualification || null,
        address: values.address || null,
        notes: values.notes || null,
        ...(photoId !== undefined ? { profilePhotoFileId: photoId } : {}),
      };
      if (editing) {
        return patch<TeacherProfile>(`/teachers/${teacherRecordId}`, { ...body, ...(values.password ? { password: values.password } : {}) });
      }
      return post<TeacherProfile>('/teachers', { ...body, password: values.password, status: values.status });
    },
    refresh: [keys.teachers, keys.subjects, keys.teacherSubjects, keys.dashboard],
    success: (saved) => (editing ? `${saved.fullName} is updated.` : `${saved.fullName} is added. Give them their sign-in details.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  const loading = editing && record.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col" key={editing ? 'edit' : 'create'}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit teacher' : 'Add a teacher'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Leave the password empty to keep the current one.' : 'You choose the first password and tell the teacher. They can change it after signing in.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {record.isError ? <ErrorState message={record.error.message} onRetry={() => void record.refetch()} /> : null}
            {loading ? (
              <div className="grid place-items-center py-16" role="status" aria-label="Loading">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : record.isError ? null : (
              <>
                {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
                <PhotoPicker
                  name={record.data?.fullName ?? ''}
                  currentPhotoUrl={record.data?.hasPhoto ? `/teachers/${record.data.id}/photo` : null}
                  value={photoId}
                  onChange={setPhotoId}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="teacher-name" error={errors.fullName?.message} className="sm:col-span-2" required>
                    <Input id="teacher-name" autoFocus={!editing} autoComplete="off" aria-invalid={!!errors.fullName} {...register('fullName')} />
                  </Field>
                  <Field label="Username" htmlFor="teacher-username" error={errors.username?.message} hint="The teacher can sign in with a username, an email, or both.">
                    <Input id="teacher-username" autoComplete="off" autoCapitalize="none" aria-invalid={!!errors.username} {...register('username')} />
                  </Field>
                  <Field label="Email" htmlFor="teacher-email" error={errors.email?.message}>
                    <Input id="teacher-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register('email')} />
                  </Field>
                  <Field
                    label={editing ? 'New password' : 'Password'}
                    htmlFor="teacher-password"
                    error={errors.password?.message}
                    hint="At least 8 characters, with a letter and a number."
                    className="sm:col-span-2"
                    required={!editing}
                  >
                    <Input id="teacher-password" type="text" autoComplete="off" spellCheck={false} aria-invalid={!!errors.password} {...register('password')} />
                  </Field>
                  <Field label="Gender" htmlFor="teacher-gender">
                    <Select id="teacher-gender" {...register('gender')}>
                      <option value="">Not stated</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </Select>
                  </Field>
                  <Field label="Phone" htmlFor="teacher-phone" error={errors.phone?.message}>
                    <Input id="teacher-phone" type="tel" autoComplete="off" aria-invalid={!!errors.phone} {...register('phone')} />
                  </Field>
                  <Field label="Qualification" htmlFor="teacher-qualification" error={errors.qualification?.message} className="sm:col-span-2">
                    <Input id="teacher-qualification" autoComplete="off" aria-invalid={!!errors.qualification} {...register('qualification')} />
                  </Field>
                  <Field label="Address" htmlFor="teacher-address" error={errors.address?.message} className="sm:col-span-2">
                    <Input id="teacher-address" autoComplete="off" aria-invalid={!!errors.address} {...register('address')} />
                  </Field>
                  <Field label="Private notes" htmlFor="teacher-notes" error={errors.notes?.message} hint="Only you can see these." className="sm:col-span-2">
                    <Textarea id="teacher-notes" rows={3} aria-invalid={!!errors.notes} {...register('notes')} />
                  </Field>
                  {!editing ? (
                    <Field label="Account" htmlFor="teacher-status" className="sm:col-span-2">
                      <Select id="teacher-status" {...register('status')}>
                        <option value="ACTIVE">Active: can sign in now</option>
                        <option value="SUSPENDED">Suspended: cannot sign in yet</option>
                      </Select>
                    </Field>
                  ) : null}
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || loading || record.isError}>
              {save.isPending ? <Spinner /> : null}
              {editing ? 'Save changes' : 'Add teacher'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
