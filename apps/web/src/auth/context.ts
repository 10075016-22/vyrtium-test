import { createContext } from 'react';
import type { RequestOptions } from '../lib/api';
import type { Session } from './session';

export interface AuthContextValue {
  session: Session | null;
  /** Why the user was sent back to the login screen, if they were. */
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (notice?: string) => void;
  /** Authenticated request: adds the bearer token and ends the session on any 401. */
  request: <T>(path: string, options?: Omit<RequestOptions, 'token'>) => Promise<T>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
