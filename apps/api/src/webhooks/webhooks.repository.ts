import type { Db } from '../db/database.js';

export interface WebhookEventRecord {
  eventId: string;
  userId: string;
  status: 'approved' | 'rejected';
  amountCents: number;
  currency: string;
  payloadHash: string;
  transactionId: string | null;
  receivedAt: string;
}

/**
 * Inserts the event unless its event_id already exists. Returns true only for
 * the first delivery; the primary key decides, not a prior SELECT.
 */
export function insertEventIfNew(db: Db, event: WebhookEventRecord): boolean {
  const inserted = db
    .prepare(
      `INSERT INTO webhook_events (event_id, user_id, status, amount_cents, currency, payload_hash, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
    )
    .get(
      event.eventId,
      event.userId,
      event.status,
      event.amountCents,
      event.currency,
      event.payloadHash,
      event.receivedAt,
    );
  return inserted !== undefined;
}

export function findEvent(db: Db, eventId: string): WebhookEventRecord | undefined {
  return db
    .prepare<[string], WebhookEventRecord>(
      `SELECT event_id AS eventId, user_id AS userId, status, amount_cents AS amountCents, currency,
              payload_hash AS payloadHash, transaction_id AS transactionId, received_at AS receivedAt
       FROM webhook_events WHERE event_id = ?`,
    )
    .get(eventId);
}

export function linkTransaction(db: Db, eventId: string, transactionId: string): void {
  db.prepare('UPDATE webhook_events SET transaction_id = ? WHERE event_id = ?').run(transactionId, eventId);
}
