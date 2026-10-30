export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Status 0 means the request never got an HTTP answer (network down, API off, CORS). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    const error = (payload as ErrorBody | undefined)?.error;
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN_ERROR', error?.message ?? response.statusText);
  }
  return payload as T;
}
