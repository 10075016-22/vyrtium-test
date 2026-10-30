import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';

interface QueryResult<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export interface ApiQuery<T> {
  /** Last data received; kept while a new request is loading so the UI does not flash. */
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * GET an authenticated resource. Each (path, attempt, refreshKey) is one request;
 * loading is derived from whether the latest request has answered yet.
 * Changing `refreshKey` refetches from outside without clearing the current data.
 */
export function useApiQuery<T>(path: string, refreshKey = 0): ApiQuery<T> {
  const { request } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<QueryResult<T>>({ key: '' });
  const key = `${path}#${attempt}#${refreshKey}`;

  useEffect(() => {
    const controller = new AbortController();
    request<T>(path, { signal: controller.signal }).then(
      (data) => {
        setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult((prev) => ({ key, data: prev.data, error }));
      },
    );
    return () => {
      controller.abort();
    };
  }, [key, path, request]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const current = result.key === key;
  return {
    data: result.data,
    error: current ? result.error : undefined,
    loading: !current,
    reload,
  };
}
