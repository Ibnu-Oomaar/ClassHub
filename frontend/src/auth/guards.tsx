import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/states';
import { get } from '@/lib/api';
import { useAuth } from './auth-context';
import type { Role, SetupStatus } from './types';

export function useSetupStatus() {
  return useQuery({ queryKey: ['setup-status'], queryFn: () => get<SetupStatus>('/setup/status'), staleTime: 60_000 });
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background" role="status" aria-label={label}>
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

/** Everything inside needs a signed-in user. Anyone else is sent to sign in (or to set the class up). */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  const setup = useSetupStatus();

  if (status === 'loading' || (status === 'anonymous' && setup.isPending)) return <FullPageSpinner />;
  if (status === 'anonymous') {
    if (setup.data && !setup.data.setupCompleted) return <Navigate to="/setup" replace />;
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Only the listed roles may open the pages inside. The server checks again on every request. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Sign-in and setup pages: a signed-in person goes straight to their dashboard. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
