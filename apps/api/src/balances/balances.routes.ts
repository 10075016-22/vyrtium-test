import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getUserId, requireAuth } from '../auth/auth.middleware.js';
import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { parseBody, parseQuery } from '../http/validation.js';
import { parseIdempotencyKey } from '../idempotency/idempotency.js';
import { applyMovement, getOrCreateBalance, getTransactionPage, type MovementType } from './balances.service.js';
import { assertSupportedCurrency, parseAmountToCents } from './money.js';

// Amounts must be JSON strings: a JSON number has already been parsed as a
// float by the time it reaches us. Unknown fields (e.g. user_id) are stripped.
const movementSchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

// Strict: unknown parameters get a clear 400 instead of being silently ignored.
const pageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export function balancesRouter(db: Db, config: Config): Router {
  const router = Router();
  router.use(requireAuth(db, config));

  router.get('/me', (req, res) => {
    res.json(getOrCreateBalance(db, getUserId(req)));
  });

  const movementHandler = (type: MovementType) => (req: Request, res: Response) => {
    const userId = getUserId(req);
    const idempotencyKey = parseIdempotencyKey(req.get('idempotency-key'));
    const body = parseBody(movementSchema, req.body);
    assertSupportedCurrency(body.currency);
    const amountCents = parseAmountToCents(body.amount);

    const result = applyMovement(db, {
      userId,
      idempotencyKey,
      type,
      amountCents,
      idempotencyTtlHours: config.idempotencyTtlHours,
    });

    res.set('Idempotent-Replayed', String(result.replayed)).status(result.statusCode).json(result.body);
  };

  router.post('/me/deposits', movementHandler('deposit'));
  router.post('/me/withdrawals', movementHandler('withdrawal'));

  router.get('/me/transactions', (req, res) => {
    const { page, pageSize } = parseQuery(pageSchema, req.query);
    res.json(getTransactionPage(db, getUserId(req), page, pageSize));
  });

  return router;
}
