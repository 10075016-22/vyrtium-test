import type { Db } from '../db/database.js';

export interface StoredResponse {
  requestHash: string;
  statusCode: number;
  responseBody: string;
}

export function findStoredResponse(db: Db, userId: string, key: string): StoredResponse | undefined {
  return db
    .prepare<[string, string], StoredResponse>(
      `SELECT request_hash AS requestHash, status_code AS statusCode, response_body AS responseBody
       FROM idempotency_keys WHERE user_id = ? AND key = ?`,
    )
    .get(userId, key);
}

/** Plain INSERT: the (user_id, key) primary key rejects a concurrent duplicate. */
export function saveResponse(db: Db, userId: string, key: string, response: StoredResponse, now: string): void {
  db.prepare(
    `INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response_body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, key, response.requestHash, response.statusCode, response.responseBody, now);
}

export function deleteExpired(db: Db, userId: string, key: string, cutoff: string): void {
  db.prepare('DELETE FROM idempotency_keys WHERE user_id = ? AND key = ? AND created_at < ?').run(userId, key, cutoff);
}
