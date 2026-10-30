import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from './auth-layout';

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter your full name.'),
  studentId: z.string().trim().min(1, 'Enter your Student ID.'),
});
type Values = z.infer<typeof schema>;

export function StudentLoginPage() {
  const { loginStudent } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const signIn = useMutation({
    mutationFn: (values: Values) => loginStudent(values),
    onSuccess: () => navigate(from && from !== '/login' ? from : '/dashboard', { replace: true }),
  });

  return (
    <AuthLayout
      title="Student sign in"
      description="Type your full name and Student ID exactly as your Class Master gave them."
      footer={<Link to="/login" className="underline-offset-4 hover:underline">Sign in a different way</Link>}
    >
      <form onSubmit={handleSubmit((values) => signIn.mutate(values))} className="space-y-5" noValidate>
        {signIn.isError ? <Alert tone="danger">{signIn.error.message}</Alert> : null}
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" autoFocus aria-invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Student ID" htmlFor="studentId" error={errors.studentId?.message} hint="For example ST-001. Ask your Class Master if you do not know it.">
          <Input id="studentId" autoComplete="off" autoCapitalize="characters" aria-invalid={!!errors.studentId} {...register('studentId')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
          {signIn.isPending ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
