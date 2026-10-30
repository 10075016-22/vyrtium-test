import { createHash } from 'node:crypto';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { deleteExpired, findStoredResponse, saveResponse } from './idempotency.repository.js';

const KEY_PATTERN = /^[\x21-\x7E]{1,255}$/; // printable ASCII, no spaces

export interface IdempotentResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotentResult extends IdempotentResponse {
  replayed: boolean;
}

export interface IdempotencyContext {
  userId: string;
  key: string;
  /** Canonical description of the request; a different value under the same key is rejected. */
  fingerprint: unknown;
  ttlHours: number;
}

export function parseIdempotencyKey(header: string | undefined): string {
  if (header === undefined || header === '') {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  }
  if (!KEY_PATTERN.test(header)) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be 1-255 printable ASCII characters without spaces',
    );
  }
  return header;
}

function hashFingerprint(fingerprint: unknown): string {
  return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
}

/**
 * Runs `execute` at most once per (user, key) and replays its stored response
 * afterwards. Lookup, execution and storing the response share one IMMEDIATE
 * transaction: SQLite takes the write lock at BEGIN, so a concurrent request
 * with the same key waits and then sees the stored response. If the process
 * dies mid-way, everything rolls back together; there is no window where money
 * moved but the key was not recorded.
 */
export function runIdempotent(
  db: Db,
  context: IdempotencyContext,
  execute: () => IdempotentResponse,
): IdempotentResult {
  const requestHash = hashFingerprint(context.fingerprint);
  const now = new Date();
  const cutoff = new Date(now.getTime() - context.ttlHours * 3_600_000).toISOString();

  return db
    .transaction((): IdempotentResult => {
      deleteExpired(db, context.userId, context.key, cutoff);

      const stored = findStoredResponse(db, context.userId, context.key);
      if (stored) {
        if (stored.requestHash !== requestHash) {
          throw new AppError(
            422,
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency-Key was already used with a different request',
          );
        }
        return { statusCode: stored.statusCode, body: JSON.parse(stored.responseBody) as unknown, replayed: true };
      }

      const response = execute();
      saveResponse(
        db,
        context.userId,
        context.key,
        { requestHash, statusCode: response.statusCode, responseBody: JSON.stringify(response.body) },
        now.toISOString(),
      );
      return { ...response, replayed: false };
    })
    .immediate();
}
