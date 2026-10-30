import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, type RequestOptions } from '../lib/api';
import { messageFor } from '../lib/errorMessages';
import type { LoginResponse } from '../lib/types';
import { AuthContext, type AuthContextValue } from './context';
import { clearSession, loadSession, saveSession, type Session } from './session';

interface AuthState {
  session: Session | null;
  notice: string | null;
}

const EXPIRED_NOTICE = 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';

function initialState(): AuthState {
  const stored = loadSession();
  if (stored && stored.expiresAt <= Date.now()) {
    clearSession();
    return { session: null, notice: EXPIRED_NOTICE };
  }
  return { session: stored, notice: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const logout = useCallback((notice?: string) => {
    clearSession();
    setState({ session: null, notice: notice ?? null });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const session: Session = {
      token: response.accessToken,
      email,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };
    saveSession(session);
    setState({ session, notice: null });
  }, []);

  const token = state.session?.token;

  const request = useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, 'token'> = {}): Promise<T> => {
      try {
        return await apiRequest<T>(path, { ...options, token });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) logout(messageFor(err));
        throw err;
      }
    },
    [token, logout],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session: state.session, notice: state.notice, login, logout, request }),
    [state, login, logout, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
