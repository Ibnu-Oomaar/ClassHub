import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import type { Role } from '@/auth/types';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from './auth-layout';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

const COPY = {
  TEACHER: { title: 'Teacher sign in', description: 'Use the username and password your Class Master created for you.' },
  CLASS_MASTER: { title: 'Class Master sign in', description: 'Use the username or email and password you set up for this class.' },
} as const;

export function StaffLoginPage({ role }: { role: Exclude<Role, 'STUDENT'> }) {
  const { loginStaff } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const signIn = useMutation({
    mutationFn: (values: Values) => loginStaff(role, values),
    onSuccess: () => navigate(from && from !== '/login' ? from : '/dashboard', { replace: true }),
  });

  return (
    <AuthLayout
      title={COPY[role].title}
      description={COPY[role].description}
      footer={<Link to="/login" className="underline-offset-4 hover:underline">Sign in a different way</Link>}
    >
      <form onSubmit={handleSubmit((values) => signIn.mutate(values))} className="space-y-5" noValidate>
        {signIn.isError ? <Alert tone="danger">{signIn.error.message}</Alert> : null}
        <Field label="Username or email" htmlFor="identifier" error={errors.identifier?.message}>
          <Input id="identifier" autoComplete="username" autoFocus aria-invalid={!!errors.identifier} {...register('identifier')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
          {signIn.isPending ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
