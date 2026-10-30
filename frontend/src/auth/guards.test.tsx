import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from '@/lib/api';
import { useAuth } from './auth-context';
import { PublicOnly, RequireAuth, RequireRole } from './guards';
import type { Me, Role } from './types';

vi.mock('./auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), get: vi.fn() }));

const signedOut = (status: 'loading' | 'anonymous' = 'anonymous') => vi.mocked(useAuth).mockReturnValue({ status, user: null } as never);
const signedIn = (role: Role) =>
  vi.mocked(useAuth).mockReturnValue({ status: 'authenticated', user: { id: '1', role, fullName: 'Test Person' } as Me } as never);
const setupStatus = (setupCompleted: boolean) => vi.mocked(get).mockResolvedValue({ setupCompleted, className: '3C Morning Boys' });

function Where() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  return <p>at {location.pathname} from {from}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<Where />} />
            <Route path="/setup" element={<Where />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<p>dashboard page</p>} />
            <Route path="/students" element={<p>students page</p>} />
            <Route element={<RequireRole roles={['CLASS_MASTER', 'TEACHER']} />}>
              <Route path="/staff-only" element={<p>staff page</p>} />
            </Route>
            <Route element={<RequireRole roles={['CLASS_MASTER']} />}>
              <Route path="/backups" element={<p>backups page</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(get).mockReset();
});

describe('RequireAuth', () => {
  it('shows a loading indicator, not the page, while the saved session is being checked', () => {
    signedOut('loading');
    setupStatus(true);
    renderAt('/students');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('students page')).not.toBeInTheDocument();
  });

  it('sends a visitor to sign in, remembering the page they wanted', async () => {
    signedOut();
    setupStatus(true);
    renderAt('/students');
    expect(await screen.findByText('at /login from /students')).toBeInTheDocument();
  });

  it('sends a visitor to the setup wizard when the class has not been set up yet', async () => {
    signedOut();
    setupStatus(false);
    renderAt('/students');
    expect(await screen.findByText(/at \/setup/)).toBeInTheDocument();
  });

  it('lets a signed-in person through', async () => {
    signedIn('STUDENT');
    setupStatus(true);
    renderAt('/students');
    expect(await screen.findByText('students page')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it.each<[Role, string, boolean]>([
    ['CLASS_MASTER', '/staff-only', true],
    ['TEACHER', '/staff-only', true],
    ['STUDENT', '/staff-only', false],
    ['CLASS_MASTER', '/backups', true],
    ['TEACHER', '/backups', false],
    ['STUDENT', '/backups', false],
  ])('%s opening %s: allowed = %s', async (role, path, allowed) => {
    signedIn(role);
    setupStatus(true);
    renderAt(path);
    if (allowed) {
      expect(await screen.findByText(path === '/backups' ? 'backups page' : 'staff page')).toBeInTheDocument();
    } else {
      expect(await screen.findByText('dashboard page')).toBeInTheDocument();
      expect(screen.queryByText(/(backups|staff) page/)).not.toBeInTheDocument();
    }
  });
});

describe('PublicOnly', () => {
  it('sends a signed-in person away from the sign-in page to their dashboard', async () => {
    signedIn('TEACHER');
    setupStatus(true);
    renderAt('/login');
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('shows the sign-in page to a visitor', async () => {
    signedOut();
    setupStatus(true);
    renderAt('/login');
    await waitFor(() => expect(screen.getByText(/at \/login/)).toBeInTheDocument());
  });
});
