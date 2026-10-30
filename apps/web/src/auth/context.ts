import { createContext } from 'react';
import type { RequestOptions } from '../lib/api';

export interface SessionUser {
  id: string;
  email: string;
}

/** `checking` while the app asks the API whether the session cookie is still valid. */
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /** Why the user was sent back to the login screen, if they were. */
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (notice?: string) => void;
  /** Request sent with the session cookie; ends the session on any 401. */
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
