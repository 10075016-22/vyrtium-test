import { vi } from 'vitest';
import { SESSION_STORAGE_KEY, type Session } from '../auth/session';

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function apiError(status: number, code: string, message = code): Response {
  return json({ error: { code, message } }, status);
}

/**
 * Replaces fetch with an in-memory API. Routes are keyed "METHOD /path"
 * (query string included). Unmatched requests fail the test loudly.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const call: RecordedCall = {
      method: init.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
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

export function storeSession(overrides: Partial<Session> = {}): void {
  const session: Session = {
    token: 'stored-token',
    email: 'ana@orbita.test',
    expiresAt: Date.now() + 30 * 60_000,
    ...overrides,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export const balance = (amount: string) => ({ amount, currency: 'USD', updatedAt: '2026-10-29T12:00:00.000Z' });

export const page = (
  data: { id: string; type: string; amount: string; balanceAfter: string }[],
  pagination: { page: number; pageSize: number; total: number; totalPages: number },
) => ({
  data: data.map((tx) => ({ currency: 'USD', createdAt: '2026-10-29T12:00:00.000Z', ...tx })),
  pagination,
});

export const emptyPage = page([], { page: 1, pageSize: 10, total: 0, totalPages: 0 });

/** A promise you resolve from the test, to hold a request "in flight". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
