import express, { Router } from 'express';
import { z } from 'zod';
import { assertSupportedCurrency, parseAmountToCents } from '../balances/money.js';
import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { parseBody } from '../http/validation.js';
import { assertValidSignature } from './signature.js';
import { processPaymentEvent } from './webhooks.service.js';

const paymentEventSchema = z.object({
  event_id: z.string().min(1).max(255),
  user_id: z.string().min(1).max(255),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(['approved', 'rejected']),
});

function parseJson(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
}

/**
 * Must be mounted before the global express.json(): the signature is checked
 * against the raw bytes, so the body is read as a Buffer for any content type.
 */
export function webhooksRouter(db: Db, config: Config): Router {
  const router = Router();

  router.post('/payment-gateway', express.raw({ type: () => true, limit: '10kb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    assertValidSignature(rawBody, req.get('x-signature'), config.webhookSecret);

    const payload = parseBody(paymentEventSchema, parseJson(rawBody));
    assertSupportedCurrency(payload.currency);

    const result = processPaymentEvent(db, {
      eventId: payload.event_id,
      userId: payload.user_id,
      amountCents: parseAmountToCents(payload.amount),
      status: payload.status,
    });

    res.status(200).json(result);
  });

  return router;
}
