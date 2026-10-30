import { vi } from 'vitest';
import type { SessionUser } from '../auth/context';

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function apiError(status: number, code: string, message = code): Response {
  return json({ error: { code, message } }, status);
}

export const ANA_USER: SessionUser = { id: 'u_123', email: 'ana@orbita.test' };

// Who the fake API sees behind the session cookie; set with storeSession().
let cookieUser: SessionUser | null = null;

/** Simulates a valid session cookie, as after a login and a page reload. */
export function storeSession(user: SessionUser = ANA_USER): void {
  cookieUser = user;
}

export function resetSession(): void {
  cookieUser = null;
}

const DEFAULT_ROUTES: Record<string, Handler> = {
  'GET /auth/me': () => (cookieUser ? json(cookieUser) : apiError(401, 'MISSING_TOKEN')),
  'POST /auth/logout': () => {
    cookieUser = null;
    return new Response(null, { status: 204 });
  },
};

/**
 * Replaces fetch with an in-memory API. Routes are keyed "METHOD /path"
 * (query string included); /auth/me and /auth/logout have cookie-aware defaults
 * a test can override. Unmatched requests fail the test loudly.
 */
export function fakeApi(testRoutes: Record<string, Handler>) {
  const routes = { ...DEFAULT_ROUTES, ...testRoutes };
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const call: RecordedCall = {
      method: init.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);

    const handler = routes[`${call.method} ${call.path}`];
    if (!handler) throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    return handler(call);
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    callsTo: (method: string, pathPrefix: string) =>
      calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix)),
  };
}

export const balance = (amount: string) => ({ amount, currency: 'USD', updatedAt: '2026-10-29T12:00:00.000Z' });

export const page = (
  data: { id: string; type: string; amount: string; balanceAfter: string }[],
  pagination: { page: number; pageSize: number; total: number; totalPages: number } = {
    page: 1,
    pageSize: 10,
    total: data.length,
    totalPages: data.length === 0 ? 0 : 1,
  },
) => ({
  data: data.map((tx) => ({ currency: 'USD', createdAt: '2026-10-29T12:00:00.000Z', ...tx })),
  pagination,
});

export const emptyPage = page([]);

/** A promise you resolve from the test, to hold a request "in flight". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
