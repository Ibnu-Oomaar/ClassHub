import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { FullPageSpinner, useSetupStatus } from '@/auth/guards';
import { useAuth } from '@/auth/auth-context';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthLayout } from './auth-layout';

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(150),
    username: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, underscore or dash only.'),
    email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/\d/, 'Include at least one number.'),
    confirmPassword: z.string().min(1, 'Type the password again.'),
  })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });
type Values = z.infer<typeof schema>;

const STEPS = ['Welcome', 'Your account'] as const;

export function SetupPage() {
  const setup = useSetupStatus();
  const { loginStaff } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const create = useMutation({
    mutationFn: async (values: Values) => {
      await post('/setup/initial', { ...values, email: values.email || undefined });
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      return loginStaff('CLASS_MASTER', { identifier: values.username, password: values.password });
    },
    onSuccess: () => navigate('/dashboard', { replace: true }),
  });

  if (setup.isPending) return <FullPageSpinner />;
  if (setup.data?.setupCompleted && !create.isPending && !create.isSuccess) return <Navigate to="/login" replace />;

  return (
    <AuthLayout
      title={step === 0 ? 'Set up your class' : 'Create the Class Master account'}
      description={step === 0 ? 'This only happens once, on first use.' : 'This account manages everything. There is no way to register later.'}
    >
      <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Setup steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2" aria-current={index === step ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full border text-xs font-semibold',
                index < step ? 'border-success bg-success text-success-foreground' : index === step ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground',
              )}
            >
              {index < step ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span className={index === step ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-5">
          <p>
            CLASSHUB manages one class: <strong className="font-semibold">{setup.data?.className ?? '3C Morning Boys'}</strong>. It starts completely empty. Nothing is
            pre-filled, so you add the subjects, teachers, students and everything else yourself.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>You become the Class Master and are the only one who can create teacher and student accounts.</li>
            <li>Everything is stored on this computer. No internet connection is needed.</li>
          </ul>
          <Button size="lg" className="w-full" onClick={() => setStep(1)}>
            Continue
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit((values) => create.mutate(values))} className="space-y-5" noValidate>
          {create.isError ? <Alert tone="danger">{create.error.message}</Alert> : null}
          <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" autoComplete="name" autoFocus aria-invalid={!!errors.fullName} {...register('fullName')} />
          </Field>
          <Field label="Username" htmlFor="username" error={errors.username?.message} hint="You will sign in with this." required>
            <Input id="username" autoComplete="username" autoCapitalize="none" aria-invalid={!!errors.username} {...register('username')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message} hint="Optional. You can also sign in with it.">
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters, with a letter and a number." required>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
            <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(0)} disabled={create.isPending}>
              Back
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : null}
              Create account and start
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
