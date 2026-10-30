import { ChevronRight, GraduationCap, ShieldCheck, UserRoundCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './auth-layout';

const WAYS = [
  { to: '/login/student', icon: GraduationCap, title: 'I am a student', text: 'Sign in with your full name and Student ID.' },
  { to: '/login/teacher', icon: UserRoundCog, title: 'I am a teacher', text: 'Sign in with your username and password.' },
  { to: '/login/class-master', icon: ShieldCheck, title: 'I am the Class Master', text: 'Sign in with your username and password.' },
];

export function LoginChooserPage() {
  return (
    <AuthLayout title="Welcome back" description="Choose how you sign in.">
      <ul className="-my-1 divide-y divide-border">
        {WAYS.map((way) => (
          <li key={way.to}>
            <Link to={way.to} className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-subtle">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                <way.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{way.title}</span>
                <span className="block text-sm text-muted-foreground">{way.text}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </AuthLayout>
  );
}
