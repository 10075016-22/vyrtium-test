export interface Session {
  token: string;
  email: string;
  /** Epoch ms. Lets the app drop an already-expired session on reload without a request. */
  expiresAt: number;
}

const STORAGE_KEY = 'orbita.session';

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.expiresAt === 'number'
  );
}

// Storage can throw (private mode, blocked site data); the app then simply has no persisted session.
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Session still works for this tab; it just won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing persisted to clear.
  }
}

export const SESSION_STORAGE_KEY = STORAGE_KEY;
