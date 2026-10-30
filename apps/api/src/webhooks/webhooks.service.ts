import { createHash, randomUUID } from 'node:crypto';
import { credit, ensureBalance, insertTransaction } from '../balances/balances.repository.js';
import { SUPPORTED_CURRENCY } from '../balances/money.js';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { userExists } from '../users/users.repository.js';
import { findEvent, insertEventIfNew, linkTransaction, type WebhookEventRecord } from './webhooks.repository.js';

export interface PaymentEvent {
  eventId: string;
  userId: string;
  amountCents: number;
  status: 'approved' | 'rejected';
}

export interface PaymentEventResult {
  eventId: string;
  status: PaymentEvent['status'];
  credited: boolean;
  duplicate: boolean;
  transactionId: string | null;
}

function toResult(event: WebhookEventRecord, duplicate: boolean): PaymentEventResult {
  return {
    eventId: event.eventId,
    status: event.status,
    credited: event.transactionId !== null,
    duplicate,
    transactionId: event.transactionId,
  };
}

function hashPayload(event: PaymentEvent): string {
  return createHash('sha256')
    .update(JSON.stringify([event.userId, event.amountCents, SUPPORTED_CURRENCY, event.status]))
    .digest('hex');
}

/**
 * Records the event and, when approved, credits the user. Recording, crediting
 * and the transaction row commit together: a crash cannot leave an event
 * marked as processed without its credit, or a credit without its event.
 */
export function processPaymentEvent(db: Db, event: PaymentEvent): PaymentEventResult {
  if (!userExists(db, event.userId)) {
    throw new AppError(422, 'UNKNOWN_USER', `User ${event.userId} does not exist`);
  }

  const now = new Date().toISOString();
  const record: WebhookEventRecord = {
    ...event,
    currency: SUPPORTED_CURRENCY,
    payloadHash: hashPayload(event),
    transactionId: null,
    receivedAt: now,
  };

  return db
    .transaction((): PaymentEventResult => {
      if (!insertEventIfNew(db, record)) {
        const existing = findEvent(db, event.eventId);
        if (!existing) throw new Error(`Webhook event ${event.eventId} vanished inside a transaction`);
        if (existing.payloadHash !== record.payloadHash) {
          throw new AppError(
            409,
            'WEBHOOK_EVENT_CONFLICT',
            `Event ${event.eventId} was already received with a different payload`,
          );
        }
        return toResult(existing, true);
      }

      if (event.status === 'rejected') {
        return toResult(record, false);
      }

      ensureBalance(db, event.userId);
      const transactionId = `txn_${randomUUID()}`;
      insertTransaction(db, event.userId, {
        id: transactionId,
        type: 'gateway_credit',
        amountCents: event.amountCents,
        balanceAfterCents: credit(db, event.userId, event.amountCents, now),
        currency: SUPPORTED_CURRENCY,
        createdAt: now,
      });
      linkTransaction(db, event.eventId, transactionId);

      return toResult({ ...record, transactionId }, false);
    })
    .immediate();
}
