import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA, createTestContext, loginAs } from './helpers.js';

const PATH = '/webhooks/payment-gateway';

// Independent of the app's own signing helper, so the test does not trust the code under test.
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function eventBody(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    event_id: 'evt_8f2a',
    user_id: 'u_123',
    amount: '200.00',
    currency: 'USD',
    status: 'approved',
    ...overrides,
  });
}

describe('POST /webhooks/payment-gateway', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  function send(body: string, signature: string | null = sign(body, ctx.config.webhookSecret)) {
    const req = request(ctx.app).post(PATH).set('Content-Type', 'application/json');
    if (signature !== null) req.set('X-Signature', signature);
    return req.send(body);
  }

  async function anaBalance(): Promise<string> {
    const token = await loginAs(ctx.app, ANA);
    const res = await request(ctx.app).get('/balances/me').set('Authorization', `Bearer ${token}`);
    return (res.body as { amount: string }).amount;
  }

  function gatewayCredits(): number {
    return (
      ctx.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE type = 'gateway_credit'").get()
        ?.n ?? 0
    );
  }

  it('credits u_123 for the statement example with a valid signature (case 19)', async () => {
    const res = await send(eventBody());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventId: 'evt_8f2a', status: 'approved', credited: true, duplicate: false });
    expect((res.body as { transactionId: string }).transactionId).toMatch(/^txn_/);
    expect(await anaBalance()).toBe('200.00');
  });

  it('records the credit in the user history', async () => {
    await send(eventBody());
    const token = await loginAs(ctx.app, ANA);
    const res = await request(ctx.app).get('/balances/me/transactions').set('Authorization', `Bearer ${token}`);

    expect((res.body as { data: unknown[] }).data).toEqual([
      expect.objectContaining({ type: 'gateway_credit', amount: '200.00', balanceAfter: '200.00' }),
    ]);
  });

  it('acknowledges a redelivered event with 2xx and does not credit again (case 20)', async () => {
    const first = await send(eventBody());
    const second = await send(eventBody());
    const third = await send(eventBody());

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ...(first.body as object), duplicate: true });
    expect(third.body).toMatchObject({ duplicate: true });
    expect(await anaBalance()).toBe('200.00');
    expect(gatewayCredits()).toBe(1);
  });

  it('credits once when the same event arrives concurrently', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => send(eventBody())));

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.filter((r) => (r.body as { duplicate: boolean }).duplicate)).toHaveLength(9);
    expect(await anaBalance()).toBe('200.00');
  });

  it('dedupes by event_id: a different event with the same payload is credited', async () => {
    await send(eventBody());
    await send(eventBody({ event_id: 'evt_other' }));
    expect(await anaBalance()).toBe('400.00');
  });

  describe('signature (case 21)', () => {
    it('rejects a missing X-Signature with 401 and does not credit', async () => {
      const res = await send(eventBody(), null);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'MISSING_SIGNATURE', message: 'X-Signature header is required' } });
      expect(gatewayCredits()).toBe(0);
    });

    it('rejects a signature with one character changed', async () => {
      const valid = sign(eventBody(), ctx.config.webhookSecret);
      const tampered = `${valid.slice(0, -1)}${valid.endsWith('0') ? '1' : '0'}`;
      const res = await send(eventBody(), tampered);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });
      expect(gatewayCredits()).toBe(0);
    });

    it('rejects a body modified after signing', async () => {
      const signature = sign(eventBody(), ctx.config.webhookSecret);
      const res = await send(eventBody({ amount: '9999.00' }), signature);

      expect(res.status).toBe(401);
      expect(gatewayCredits()).toBe(0);
    });

    it('rejects a signature made with another secret', async () => {
      const res = await send(eventBody(), sign(eventBody(), 'not-the-secret'));
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'abc123'],
      ['non-hex characters', 'z'.repeat(64)],
      ['a sha256= prefix', `sha256=${'a'.repeat(64)}`],
    ])('rejects a malformed signature (%s) without throwing', async (_case, signature) => {
      const res = await send(eventBody(), signature);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });
    });

    it('accepts an uppercase hex signature', async () => {
      const res = await send(eventBody(), sign(eventBody(), ctx.config.webhookSecret).toUpperCase());
      expect(res.status).toBe(200);
    });

    it('checks the signature before parsing: an unsigned invalid body is 401, not 400', async () => {
      const res = await send('{not json', null);
      expect(res.status).toBe(401);
    });
  });

  it('acknowledges a rejected payment with 2xx and does not credit (case 22)', async () => {
    const res = await send(eventBody({ event_id: 'evt_rej', status: 'rejected' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      eventId: 'evt_rej',
      status: 'rejected',
      credited: false,
      duplicate: false,
      transactionId: null,
    });
    expect(gatewayCredits()).toBe(0);
    expect(await anaBalance()).toBe('0.00');
  });

  it('verifies the signature over the raw bytes, whatever the spacing (case 23)', async () => {
    const pretty = JSON.stringify(JSON.parse(eventBody()), null, 4);
    const res = await send(pretty);

    expect(res.status).toBe(200);
    expect(await anaBalance()).toBe('200.00');
  });

  it('verifies the signature even without a JSON content type', async () => {
    const body = eventBody();
    const res = await request(ctx.app)
      .post(PATH)
      .set('Content-Type', 'text/plain')
      .set('X-Signature', sign(body, ctx.config.webhookSecret))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects an event for a user that does not exist with 422 and records nothing (case 24)', async () => {
    const res = await send(eventBody({ user_id: 'u_missing' }));

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'UNKNOWN_USER', message: 'User u_missing does not exist' } });
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()).toEqual({ n: 0 });
  });

  it('rejects a known event_id redelivered with a different payload (409) and keeps the original', async () => {
    await send(eventBody());
    const res = await send(eventBody({ amount: '5000.00' }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'WEBHOOK_EVENT_CONFLICT' } });
    expect(await anaBalance()).toBe('200.00');
  });

  it('does not let a rejected event be turned into an approval under the same event_id', async () => {
    await send(eventBody({ status: 'rejected' }));
    const res = await send(eventBody({ status: 'approved' }));

    expect(res.status).toBe(409);
    expect(await anaBalance()).toBe('0.00');
  });

  describe('payload validation (signed, so it reaches validation)', () => {
    it('rejects signed non-JSON with 400 INVALID_JSON', async () => {
      const res = await send('{not json');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
    });

    it('rejects an empty signed body', async () => {
      const res = await send('');
      expect(res.status).toBe(400);
    });

    it.each([
      ['an unknown status', { status: 'pending' }],
      ['a missing event_id', { event_id: '' }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_case, overrides) => {
      const res = await send(eventBody(overrides));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    });

    it.each([
      ['amount', { amount: '10.123' }, 'INVALID_AMOUNT'],
      ['amount', { amount: '-5' }, 'INVALID_AMOUNT'],
      ['amount', { amount: '10000.01' }, 'AMOUNT_LIMIT_EXCEEDED'],
      ['currency', { currency: 'EUR' }, 'UNSUPPORTED_CURRENCY'],
    ])('applies the same %s rules as deposits (%j -> %s)', async (_field, overrides, code) => {
      const res = await send(eventBody(overrides));
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: { code } });
      expect(gatewayCredits()).toBe(0);
    });

    it('rejects a body larger than 10 KB', async () => {
      const res = await send(eventBody({ padding: 'x'.repeat(20_000) }));
      expect(res.status).toBe(413);
    });
  });

  it('is not affected by the bearer-token middleware', async () => {
    const res = await send(eventBody());
    expect(res.status).toBe(200);
  });
});
