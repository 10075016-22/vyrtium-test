import { randomUUID } from 'node:crypto';
import type { Db } from '../db/database.js';
import { AppError, toBody } from '../http/errors.js';
import { runIdempotent, type IdempotentResult } from '../idempotency/idempotency.js';
import {
  countTransactions,
  credit,
  debitIfSufficient,
  ensureBalance,
  getBalance,
  insertTransaction,
  listTransactions,
  type TransactionRecord,
} from './balances.repository.js';
import { formatCents, SUPPORTED_CURRENCY } from './money.js';

export type MovementType = 'deposit' | 'withdrawal';

export interface BalanceView {
  amount: string;
  currency: string;
  updatedAt: string;
}

export interface TransactionView {
  id: string;
  type: TransactionRecord['type'];
  amount: string;
  balanceAfter: string;
  currency: string;
  createdAt: string;
}

export interface TransactionPage {
  data: TransactionView[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface MovementRequest {
  userId: string;
  idempotencyKey: string;
  type: MovementType;
  amountCents: number;
  idempotencyTtlHours: number;
}

function toTransactionView(tx: TransactionRecord): TransactionView {
  return {
    id: tx.id,
    type: tx.type,
    amount: formatCents(tx.amountCents),
    balanceAfter: formatCents(tx.balanceAfterCents),
    currency: tx.currency,
    createdAt: tx.createdAt,
  };
}

function readBalance(db: Db, userId: string): BalanceView {
  const balance = getBalance(db, userId);
  if (!balance) throw new Error(`Balance for ${userId} does not exist`);
  return { amount: formatCents(balance.amountCents), currency: balance.currency, updatedAt: balance.updatedAt };
}

export function getOrCreateBalance(db: Db, userId: string): BalanceView {
  ensureBalance(db, userId);
  return readBalance(db, userId);
}

/**
 * Deposit or withdrawal. Balance update, transaction row and the idempotent
 * response are written in the same database transaction.
 */
export function applyMovement(db: Db, request: MovementRequest): IdempotentResult {
  const { userId, type, amountCents } = request;

  return runIdempotent(
    db,
    {
      userId,
      key: request.idempotencyKey,
      fingerprint: [type, amountCents, SUPPORTED_CURRENCY],
      ttlHours: request.idempotencyTtlHours,
    },
    () => {
      const now = new Date().toISOString();
      ensureBalance(db, userId);

      const balanceAfterCents =
        type === 'deposit' ? credit(db, userId, amountCents, now) : debitIfSufficient(db, userId, amountCents, now);

      if (balanceAfterCents === undefined) {
        // Stored like any other outcome: retrying the same key returns the same answer.
        return {
          statusCode: 422,
          body: toBody(new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds for this withdrawal')),
        };
      }

      const transaction: TransactionRecord = {
        id: `txn_${randomUUID()}`,
        type,
        amountCents,
        balanceAfterCents,
        currency: SUPPORTED_CURRENCY,
        createdAt: now,
      };
      insertTransaction(db, userId, transaction);

      return {
        statusCode: 201,
        body: { transaction: toTransactionView(transaction), balance: readBalance(db, userId) },
      };
    },
  );
}

export function getTransactionPage(db: Db, userId: string, page: number, pageSize: number): TransactionPage {
  const total = countTransactions(db, userId);
  const data = listTransactions(db, userId, pageSize, (page - 1) * pageSize).map(toTransactionView);
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
