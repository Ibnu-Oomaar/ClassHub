import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { get, post, setUnauthorizedHandler, tokenStore } from '@/lib/api';
import type { LoginResponse, Me, Role } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: Me | null;
  loginStudent: (input: { fullName: string; studentId: string }) => Promise<Me>;
  loginStaff: (role: Exclude<Role, 'STUDENT'>, input: { identifier: string; password: string }) => Promise<Me>;
  logout: () => void;
  /** Puts a changed copy of the signed-in person (new name, username or email) on screen. */
  updateUser: (user: Me) => void;
  /** Changes the password. The server signs every other device out and hands back a fresh session for this one. */
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<Me | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => tokenStore.get() !== null);

  // Restore the session after a page refresh.
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => get<Me>('/users/me'),
    enabled: hasToken && user === null,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (session.data) setUser(session.data);
  }, [session.data]);

  useEffect(() => {
    if (session.isError) {
      tokenStore.clear();
      setHasToken(false);
    }
  }, [session.isError]);

  const logout = useCallback(() => {
    tokenStore.clear();
    setHasToken(false);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      toast.error('Your session has ended. Sign in again to continue.');
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const accept = useCallback(
    (response: LoginResponse): Me => {
      queryClient.clear();
      tokenStore.set(response.accessToken);
      setHasToken(true);
      setUser(response.user);
      return response.user;
    },
    [queryClient],
  );

  const loginStudent = useCallback(async (input: { fullName: string; studentId: string }) => accept(await post<LoginResponse>('/auth/student-login', input)), [accept]);

  const loginStaff = useCallback(
    async (role: Exclude<Role, 'STUDENT'>, input: { identifier: string; password: string }) =>
      accept(await post<LoginResponse>(role === 'CLASS_MASTER' ? '/auth/class-master-login' : '/auth/teacher-login', input)),
    [accept],
  );

  const updateUser = useCallback((next: Me) => setUser(next), []);

  const changePassword = useCallback(
    async (input: { currentPassword: string; newPassword: string }) => {
      const response = await post<LoginResponse>('/auth/change-password', input);
      tokenStore.set(response.accessToken);
      setUser(response.user);
    },
    [],
  );

  const status: Status = user ? 'authenticated' : hasToken && !session.isError ? 'loading' : 'anonymous';
  const value = useMemo(
    () => ({ status, user, loginStudent, loginStaff, logout, updateUser, changePassword }),
    [status, user, loginStudent, loginStaff, logout, updateUser, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** The signed-in user. Only call it on pages that are behind the sign-in guard. */
export function useMe(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useMe needs a signed-in user');
  return user;
}
