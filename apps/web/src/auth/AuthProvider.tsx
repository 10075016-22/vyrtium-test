import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, type RequestOptions } from '../lib/api';
import { messageFor } from '../lib/errorMessages';
import { AuthContext, type AuthContextValue, type AuthStatus, type SessionUser } from './context';

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  notice: string | null;
}

/** Only an expired or rejected session deserves an explanation; "no session yet" does not. */
function noticeFor(error: unknown): string | null {
  return error instanceof ApiError && (error.code === 'TOKEN_EXPIRED' || error.code === 'INVALID_TOKEN')
    ? messageFor(error)
    : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking', user: null, notice: null });

  // The token lives in an HttpOnly cookie this code cannot read, so the API says
  // whether the session survived the reload and who it belongs to.
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<SessionUser>('/auth/me', { signal: controller.signal }).then(
      (user) => {
        setState({ status: 'signed-in', user, notice: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'signed-out', user: null, notice: noticeFor(error) });
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  const logout = useCallback((notice?: string) => {
    setState({ status: 'signed-out', user: null, notice: notice ?? null });
    // Only the server can delete an HttpOnly cookie. If this fails (API down), the
    // cookie still expires with the token.
    apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    const user = await apiRequest<SessionUser>('/auth/me');
    setState({ status: 'signed-in', user, notice: null });
  }, []);

  const request = useCallback(
    async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
      try {
        return await apiRequest<T>(path, options);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) logout(messageFor(err));
        throw err;
      }
    },
    [logout],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, request }),
    [state, login, logout, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
