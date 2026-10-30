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
import type { StudentProfile } from './types';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(150, 'Use at most 150 characters.'),
  studentId: z
    .string()
    .trim()
    .min(1, 'Enter the Student ID.')
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/, 'Use letters, numbers, dot, dash, underscore or slash (up to 40 characters).'),
  gender: z.enum(['', 'MALE', 'FEMALE']),
  dateOfBirth: z.string().refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Enter a valid date.'),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[0-9+()\-\s.]{5,40}$/.test(value), 'Use digits, spaces and + ( ) - . only.'),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
  address: z.string().trim().max(500, 'Use at most 500 characters.'),
  notes: z.string().trim().max(2000, 'Use at most 2000 characters.'),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { fullName: '', studentId: '', gender: '', dateOfBirth: '', phone: '', email: '', address: '', notes: '', status: 'ACTIVE' };

function toValues(student: StudentProfile): Values {
  return {
    fullName: student.fullName,
    studentId: student.studentId,
    gender: student.gender ?? '',
    dateOfBirth: student.dateOfBirth ?? '',
    phone: student.phone ?? '',
    email: student.email ?? '',
    address: student.address ?? '',
    notes: student.notes ?? '',
    status: student.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
  };
}

/** Add a student, or change one. Passing `studentRecordId` loads that student's full record first. */
export function StudentFormDialog({
  open,
  onOpenChange,
  studentRecordId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentRecordId: string | null;
}) {
  const editing = studentRecordId !== null;
  const record = useQuery({
    queryKey: [...keys.students, 'one', studentRecordId],
    queryFn: () => get<StudentProfile>(`/students/${studentRecordId}`),
    enabled: open && editing,
  });

  const [photoId, setPhotoId] = useState<string | null | undefined>(undefined);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

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
        studentId: values.studentId,
        gender: values.gender || null,
        dateOfBirth: values.dateOfBirth || null,
        phone: values.phone || null,
        email: values.email || null,
        address: values.address || null,
        notes: values.notes || null,
        ...(photoId !== undefined ? { profilePhotoFileId: photoId } : {}),
      };
      return editing ? patch<StudentProfile>(`/students/${studentRecordId}`, body) : post<StudentProfile>('/students', { ...body, status: values.status });
    },
    refresh: [keys.students, keys.dashboard],
    success: (saved) => (editing ? `${saved.fullName} is updated.` : `${saved.fullName} is added. They sign in with their full name and Student ID ${saved.studentId}.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  const loading = editing && record.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit student' : 'Add a student'}</DialogTitle>
            <DialogDescription>Students sign in with their full name and Student ID, exactly as entered here. They have no password.</DialogDescription>
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
                  currentPhotoUrl={record.data?.hasPhoto ? `/students/${record.data.id}/photo` : null}
                  value={photoId}
                  onChange={setPhotoId}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="student-name" error={errors.fullName?.message} className="sm:col-span-2" required>
                    <Input id="student-name" autoFocus={!editing} autoComplete="off" aria-invalid={!!errors.fullName} {...register('fullName')} />
                  </Field>
                  <Field label="Student ID" htmlFor="student-id" error={errors.studentId?.message} hint="Unique. Shown in capitals, for example ST-001." required>
                    <Input id="student-id" autoComplete="off" autoCapitalize="characters" aria-invalid={!!errors.studentId} {...register('studentId')} />
                  </Field>
                  <Field label="Gender" htmlFor="student-gender" error={errors.gender?.message}>
                    <Select id="student-gender" {...register('gender')}>
                      <option value="">Not stated</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </Select>
                  </Field>
                  <Field label="Date of birth" htmlFor="student-dob" error={errors.dateOfBirth?.message}>
                    <Input id="student-dob" type="date" aria-invalid={!!errors.dateOfBirth} {...register('dateOfBirth')} />
                  </Field>
                  <Field label="Phone" htmlFor="student-phone" error={errors.phone?.message}>
                    <Input id="student-phone" type="tel" autoComplete="off" aria-invalid={!!errors.phone} {...register('phone')} />
                  </Field>
                  <Field label="Email" htmlFor="student-email" error={errors.email?.message} className="sm:col-span-2">
                    <Input id="student-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register('email')} />
                  </Field>
                  <Field label="Address" htmlFor="student-address" error={errors.address?.message} className="sm:col-span-2">
                    <Input id="student-address" autoComplete="off" aria-invalid={!!errors.address} {...register('address')} />
                  </Field>
                  <Field label="Private notes" htmlFor="student-notes" error={errors.notes?.message} hint="Only you can see these." className="sm:col-span-2">
                    <Textarea id="student-notes" rows={3} aria-invalid={!!errors.notes} {...register('notes')} />
                  </Field>
                  {!editing ? (
                    <Field label="Account" htmlFor="student-status" className="sm:col-span-2">
                      <Select id="student-status" {...register('status')}>
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
              {editing ? 'Save changes' : 'Add student'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
