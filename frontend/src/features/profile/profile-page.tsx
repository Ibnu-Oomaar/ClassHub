import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth, useMe } from '@/auth/auth-context';
import { ROLE_LABEL, type Me } from '@/auth/types';
import { Avatar } from '@/components/avatar';
import { Field } from '@/components/form-field';
import { PageHeader, Section } from '@/components/page-header';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { patch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const detailsSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(150),
  username: z
    .string()
    .trim()
    .max(60)
    .refine((value) => value === '' || value.length >= 3, 'Use at least 3 characters.')
    .refine((value) => value === '' || /^[A-Za-z0-9._-]+$/.test(value), 'Use letters, numbers, dot, underscore or dash only.'),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
});
type DetailsValues = z.infer<typeof detailsSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/\d/, 'Include at least one number.'),
    confirmPassword: z.string().min(1, 'Type the new password again.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' })
  .refine((values) => values.newPassword !== values.currentPassword, { path: ['newPassword'], message: 'Choose a password you have not used just now.' });
type PasswordValues = z.infer<typeof passwordSchema>;

function DetailsForm({ me }: { me: Me }) {
  const { updateUser } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { fullName: me.fullName, username: me.username ?? '', email: me.email ?? '' },
  });

  const save = useMutation({
    mutationFn: (values: DetailsValues) => patch<Me>('/users/me', { fullName: values.fullName, username: values.username || null, email: values.email || null }),
    onSuccess: (updated) => {
      updateUser(updated);
      reset({ fullName: updated.fullName, username: updated.username ?? '', email: updated.email ?? '' });
      toast.success('Your details are saved.');
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(values))} className="max-w-xl space-y-5" noValidate>
      {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...register('fullName')} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Username" htmlFor="username" error={errors.username?.message}>
          <Input id="username" autoComplete="username" autoCapitalize="none" aria-invalid={!!errors.username} {...register('username')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">You can sign in with either your username or your email. Keep at least one of them.</p>
      <Button type="submit" disabled={!isDirty || save.isPending}>
        {save.isPending ? <Spinner /> : <Check />}
        Save details
      </Button>
    </form>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const change = useMutation({
    mutationFn: (values: PasswordValues) => changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      reset();
      toast.success('Password changed. Your other devices were signed out.');
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => change.mutate(values))} className="max-w-xl space-y-5" noValidate>
      {change.isError ? <Alert tone="danger">{change.error.message}</Alert> : null}
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
        <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message} hint="At least 8 characters, with a letter and a number." required>
          <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
        </Field>
      </div>
      <Button type="submit" disabled={change.isPending}>
        {change.isPending ? <Spinner /> : null}
        Change password
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const me = useMe();
  const isStudent = me.role === 'STUDENT';

  return (
    <>
      <PageHeader title="My account" description="Your sign-in details and security." />

      <div className="mb-9 flex items-center gap-4">
        <Avatar name={me.fullName} className="size-16 text-xl" photoUrl={!me.hasPhoto ? null : me.role === 'STUDENT' ? '/students/me/photo' : me.role === 'TEACHER' ? '/teachers/me/photo' : null} />
        <div>
          <p className="font-display text-2xl">{me.fullName}</p>
          <p className="text-muted-foreground">
            {ROLE_LABEL[me.role]}
            {me.studentCode ? `, Student ID ${me.studentCode}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">Last signed in {formatDateTime(me.lastLoginAt)}</p>
        </div>
      </div>

      {isStudent ? (
        <Alert tone="info" title="Your details are kept by the Class Master">
          You sign in with your full name and your Student ID, so there is no password to change. If your name is spelled wrong or your Student ID has to change, ask the Class Master.
        </Alert>
      ) : (
        <>
          <Section title="Your details" description="Shown to the class and used to sign in.">
            <DetailsForm me={me} />
          </Section>
          <Section title="Password" description="Changing it signs you out of every other device.">
            <PasswordForm />
          </Section>
        </>
      )}
    </>
  );
}
