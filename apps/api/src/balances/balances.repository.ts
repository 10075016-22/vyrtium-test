import type { Db } from '../db/database.js';

export type TransactionType = 'deposit' | 'withdrawal' | 'gateway_credit';

export interface BalanceRecord {
  amountCents: number;
  currency: string;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  amountCents: number;
  balanceAfterCents: number;
  currency: string;
  createdAt: string;
}

/** Creates the balance at 0 on first access; a no-op afterwards. */
export function ensureBalance(db: Db, userId: string): void {
  db.prepare('INSERT INTO balances (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING').run(userId);
}

export function getBalance(db: Db, userId: string): BalanceRecord | undefined {
  return db
    .prepare<[string], BalanceRecord>(
      'SELECT amount_cents AS amountCents, currency, updated_at AS updatedAt FROM balances WHERE user_id = ?',
    )
    .get(userId);
}

export function credit(db: Db, userId: string, amountCents: number, now: string): number {
  const row = db
    .prepare<[number, string, string], { amountCents: number }>(
      `UPDATE balances SET amount_cents = amount_cents + ?, updated_at = ?
       WHERE user_id = ? RETURNING amount_cents AS amountCents`,
    )
    .get(amountCents, now, userId);
  if (!row) throw new Error(`Balance for ${userId} does not exist`);
  return row.amountCents;
}

/**
 * Conditional update: the check and the write are one statement, so two
 * concurrent withdrawals cannot both pass a stale "balance >= amount" read.
 * Returns the new balance, or undefined when funds are insufficient.
 */
export function debitIfSufficient(db: Db, userId: string, amountCents: number, now: string): number | undefined {
  return db
    .prepare<[number, string, string, number], { amountCents: number }>(
      `UPDATE balances SET amount_cents = amount_cents - ?, updated_at = ?
       WHERE user_id = ? AND amount_cents >= ? RETURNING amount_cents AS amountCents`,
    )
    .get(amountCents, now, userId, amountCents)?.amountCents;
}

export function insertTransaction(db: Db, userId: string, tx: TransactionRecord): void {
  db.prepare(
    `INSERT INTO transactions (id, user_id, type, amount_cents, balance_after_cents, currency, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(tx.id, userId, tx.type, tx.amountCents, tx.balanceAfterCents, tx.currency, tx.createdAt);
}

export function listTransactions(db: Db, userId: string, limit: number, offset: number): TransactionRecord[] {
  return db
    .prepare<[string, number, number], TransactionRecord>(
      `SELECT id, type, amount_cents AS amountCents, balance_after_cents AS balanceAfterCents,
              currency, created_at AS createdAt
       FROM transactions WHERE user_id = ?
       ORDER BY seq DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset);
}

export function countTransactions(db: Db, userId: string): number {
  return (
    db.prepare<[string], { total: number }>('SELECT COUNT(*) AS total FROM transactions WHERE user_id = ?').get(userId)
      ?.total ?? 0
  );
}
