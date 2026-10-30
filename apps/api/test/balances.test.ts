import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA, LUIS, createTestContext, loginAs } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestContext>> & { token: string; luisToken: string };

interface BalanceBody {
  amount: string;
  currency: string;
}

interface MovementBody {
  transaction: { id: string; type: string; amount: string; balanceAfter: string; currency: string };
  balance: BalanceBody;
}

async function setup(): Promise<Ctx> {
  const ctx = await createTestContext();
  return { ...ctx, token: await loginAs(ctx.app, ANA), luisToken: await loginAs(ctx.app, LUIS) };
}

function move(
  ctx: Ctx,
  kind: 'deposits' | 'withdrawals',
  amount: string,
  key: string,
  token = ctx.token,
) {
  return request(ctx.app)
    .post(`/balances/me/${kind}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({ amount, currency: 'USD' });
}

async function balanceOf(ctx: Ctx, token = ctx.token): Promise<string> {
  const res = await request(ctx.app).get('/balances/me').set('Authorization', `Bearer ${token}`);
  return (res.body as BalanceBody).amount;
}

function countTransactions(ctx: Ctx, userId = ANA.id): number {
  return (
    ctx.db.prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?').get(userId)?.n ??
    0
  );
}

describe('balances API', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await setup();
  });

  describe('authentication', () => {
    it.each([
      ['get', '/balances/me'],
      ['post', '/balances/me/deposits'],
      ['post', '/balances/me/withdrawals'],
      ['get', '/balances/me/transactions'],
    ] as const)('%s %s requires a token', async (method, path) => {
      const res = await request(ctx.app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: 'MISSING_TOKEN' } });
    });
  });

  describe('GET /balances/me', () => {
    it('creates the balance at 0.00 on first access (case 5)', async () => {
      const res = await request(ctx.app).get('/balances/me').set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ amount: '0.00', currency: 'USD' });
      expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM balances').get()).toEqual({ n: 1 });
    });
  });

  describe('deposits', () => {
    it('credits the amount and records a transaction (case 6)', async () => {
      const res = await move(ctx, 'deposits', '150.25', 'k1');

      expect(res.status).toBe(201);
      expect(res.headers['idempotent-replayed']).toBe('false');
      const body = res.body as MovementBody;
      expect(body.transaction).toMatchObject({ type: 'deposit', amount: '150.25', balanceAfter: '150.25', currency: 'USD' });
      expect(body.transaction.id).toMatch(/^txn_/);
      expect(body.balance).toMatchObject({ amount: '150.25', currency: 'USD' });
      expect(countTransactions(ctx)).toBe(1);
    });

    it('keeps exact decimal precision: 0.10 + 0.20 = 0.30 (case 13)', async () => {
      await move(ctx, 'deposits', '0.10', 'p1');
      await move(ctx, 'deposits', '0.20', 'p2');
      expect(await balanceOf(ctx)).toBe('0.30');
    });

    it('accepts exactly the 10000.00 limit (case 12)', async () => {
      const res = await move(ctx, 'deposits', '10000.00', 'max');
      expect(res.status).toBe(201);
    });

    it.each([
      ['0', 'INVALID_AMOUNT'],
      ['-5', 'INVALID_AMOUNT'],
      ['10.123', 'INVALID_AMOUNT'],
      ['abc', 'INVALID_AMOUNT'],
      ['10000.01', 'AMOUNT_LIMIT_EXCEEDED'],
    ])('rejects amount %j with 422 %s and no side effects (case 11)', async (amount, code) => {
      const res = await move(ctx, 'deposits', amount, `bad-${amount}`);

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: { code } });
      expect(countTransactions(ctx)).toBe(0);
    });

    it('rejects a currency other than USD (case 11)', async () => {
      const res = await request(ctx.app)
        .post('/balances/me/deposits')
        .set('Authorization', `Bearer ${ctx.token}`)
        .set('Idempotency-Key', 'eur')
        .send({ amount: '10.00', currency: 'EUR' });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: { code: 'UNSUPPORTED_CURRENCY' } });
    });

    it.each([
      ['a JSON number amount', { amount: 10.5, currency: 'USD' }],
      ['a missing amount', { currency: 'USD' }],
      ['a missing currency', { amount: '10.00' }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_case, body) => {
      const res = await request(ctx.app)
        .post('/balances/me/deposits')
        .set('Authorization', `Bearer ${ctx.token}`)
        .set('Idempotency-Key', 'schema')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    });

    it('credits the token user and ignores user ids in headers or body (case 17)', async () => {
      const res = await request(ctx.app)
        .post('/balances/me/deposits')
        .set('Authorization', `Bearer ${ctx.token}`)
        .set('Idempotency-Key', 'spoof')
        .set('X-User-Id', LUIS.id)
        .send({ amount: '50.00', currency: 'USD', user_id: LUIS.id });

      expect(res.status).toBe(201);
      expect(await balanceOf(ctx)).toBe('50.00');
      expect(await balanceOf(ctx, ctx.luisToken)).toBe('0.00');
    });
  });

  describe('Idempotency-Key', () => {
    it('replays the original response without moving money again (case 7)', async () => {
      const first = await move(ctx, 'deposits', '150.25', 'k1');
      const retry = await move(ctx, 'deposits', '150.25', 'k1');

      expect(retry.status).toBe(first.status);
      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(await balanceOf(ctx)).toBe('150.25');
      expect(countTransactions(ctx)).toBe(1);
    });

    it('rejects the same key with a different body and creates nothing (case 8)', async () => {
      await move(ctx, 'deposits', '150.25', 'k1');
      const res = await move(ctx, 'deposits', '10.00', 'k1');

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
      expect(await balanceOf(ctx)).toBe('150.25');
      expect(countTransactions(ctx)).toBe(1);
    });

    it('rejects reusing a deposit key for a withdrawal', async () => {
      await move(ctx, 'deposits', '100.00', 'k1');
      const res = await move(ctx, 'withdrawals', '100.00', 'k1');

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
      expect(await balanceOf(ctx)).toBe('100.00');
    });

    it('treats an equivalent amount ("150.2" vs "150.20") as the same request', async () => {
      await move(ctx, 'deposits', '150.2', 'k1');
      const retry = await move(ctx, 'deposits', '150.20', 'k1');

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(countTransactions(ctx)).toBe(1);
    });

    it('requires the header (case 9)', async () => {
      const res = await request(ctx.app)
        .post('/balances/me/deposits')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ amount: '10.00', currency: 'USD' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
      expect(countTransactions(ctx)).toBe(0);
    });

    it.each([
      ['spaces', 'has spaces'],
      ['too long', 'x'.repeat(256)],
    ])('rejects a key with %s', async (_case, key) => {
      const res = await move(ctx, 'deposits', '10.00', key);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_INVALID' } });
    });

    it('scopes keys per user: the same key from another user is a new request (case 10)', async () => {
      const ana = await move(ctx, 'deposits', '150.25', 'k1');
      const luis = await move(ctx, 'deposits', '150.25', 'k1', ctx.luisToken);

      expect(luis.status).toBe(201);
      expect(luis.headers['idempotent-replayed']).toBe('false');
      expect((luis.body as MovementBody).transaction.id).not.toBe((ana.body as MovementBody).transaction.id);
      expect(await balanceOf(ctx, ctx.luisToken)).toBe('150.25');
      expect(await balanceOf(ctx)).toBe('150.25');
    });

    it('creates a single deposit when the same key arrives in parallel (case 16)', async () => {
      const responses = await Promise.all(Array.from({ length: 10 }, () => move(ctx, 'deposits', '25.00', 'same')));

      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(new Set(responses.map((r) => (r.body as MovementBody).transaction.id)).size).toBe(1);
      expect(responses.filter((r) => r.headers['idempotent-replayed'] === 'false')).toHaveLength(1);
      expect(await balanceOf(ctx)).toBe('25.00');
      expect(countTransactions(ctx)).toBe(1);
    });

    it('lets a key be reused once its stored response has expired', async () => {
      await move(ctx, 'deposits', '10.00', 'old');
      ctx.db.prepare("UPDATE idempotency_keys SET created_at = '2000-01-01T00:00:00.000Z'").run();

      const res = await move(ctx, 'deposits', '10.00', 'old');
      expect(res.headers['idempotent-replayed']).toBe('false');
      expect(await balanceOf(ctx)).toBe('20.00');
    });

    it('does not store validation failures, so the key stays usable', async () => {
      await move(ctx, 'deposits', 'abc', 'fix-me');
      const res = await move(ctx, 'deposits', '10.00', 'fix-me');
      expect(res.status).toBe(201);
    });
  });

  describe('withdrawals', () => {
    beforeEach(async () => {
      await move(ctx, 'deposits', '100.00', 'seed');
    });

    it('debits the balance and records a withdrawal', async () => {
      const res = await move(ctx, 'withdrawals', '30.50', 'w1');

      expect(res.status).toBe(201);
      expect((res.body as MovementBody).transaction).toMatchObject({
        type: 'withdrawal',
        amount: '30.50',
        balanceAfter: '69.50',
      });
      expect(await balanceOf(ctx)).toBe('69.50');
    });

    it('can withdraw the whole balance down to exactly 0.00', async () => {
      const res = await move(ctx, 'withdrawals', '100.00', 'all');
      expect(res.status).toBe(201);
      expect(await balanceOf(ctx)).toBe('0.00');
    });

    it('rejects insufficient funds with 422, balance intact and no transaction (case 14)', async () => {
      const res = await move(ctx, 'withdrawals', '100.01', 'w1');

      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds for this withdrawal' },
      });
      expect(await balanceOf(ctx)).toBe('100.00');
      expect(countTransactions(ctx)).toBe(1); // only the seed deposit
    });

    it('replays an insufficient-funds answer for the same key even after a later deposit', async () => {
      await move(ctx, 'withdrawals', '150.00', 'w1');
      await move(ctx, 'deposits', '100.00', 'top-up');

      const retry = await move(ctx, 'withdrawals', '150.00', 'w1');
      expect(retry.status).toBe(422);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(await balanceOf(ctx)).toBe('200.00');
    });

    it('lets only one of two concurrent 80.00 withdrawals through from 100.00 (case 15)', async () => {
      const [a, b] = await Promise.all([move(ctx, 'withdrawals', '80.00', 'r1'), move(ctx, 'withdrawals', '80.00', 'r2')]);

      expect([a.status, b.status].sort()).toEqual([201, 422]);
      expect(await balanceOf(ctx)).toBe('20.00');
    });

    it('never goes negative under a burst of concurrent withdrawals', async () => {
      const responses = await Promise.all(
        Array.from({ length: 25 }, (_, i) => move(ctx, 'withdrawals', '7.00', `burst-${i}`)),
      );

      const succeeded = responses.filter((r) => r.status === 201).length;
      expect(succeeded).toBe(14); // floor(100 / 7)
      expect(responses.filter((r) => r.status === 422)).toHaveLength(11);
      expect(await balanceOf(ctx)).toBe('2.00');
      expect(countTransactions(ctx)).toBe(1 + succeeded);
    });
  });

  describe('database constraints', () => {
    it('refuses a negative balance even if application code tried to write one', async () => {
      await balanceOf(ctx);
      expect(() => ctx.db.prepare('UPDATE balances SET amount_cents = -1 WHERE user_id = ?').run(ANA.id)).toThrow(
        /CHECK constraint failed/,
      );
    });

    it('refuses a second row for the same (user, idempotency key)', async () => {
      await move(ctx, 'deposits', '1.00', 'dup');
      expect(() =>
        ctx.db
          .prepare(
            "INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response_body, created_at) VALUES (?, 'dup', 'h', 201, '{}', 'now')",
          )
          .run(ANA.id),
      ).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('GET /balances/me/transactions', () => {
    function list(query = '') {
      return request(ctx.app).get(`/balances/me/transactions${query}`).set('Authorization', `Bearer ${ctx.token}`);
    }

    it('returns an empty first page for a user without movements', async () => {
      const res = await list();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    });

    it('lists newest first with page metadata (case 18)', async () => {
      for (const [i, amount] of ['1.00', '2.00', '3.00'].entries()) {
        await move(ctx, 'deposits', amount, `t${i}`);
      }
      await move(ctx, 'withdrawals', '0.50', 'tw');

      const res = await list('?page=1&pageSize=3');
      const body = res.body as { data: { type: string; amount: string }[]; pagination: unknown };

      expect(body.data.map((t) => `${t.type}:${t.amount}`)).toEqual([
        'withdrawal:0.50',
        'deposit:3.00',
        'deposit:2.00',
      ]);
      expect(body.pagination).toEqual({ page: 1, pageSize: 3, total: 4, totalPages: 2 });

      const second = await list('?page=2&pageSize=3');
      expect((second.body as { data: { amount: string }[] }).data.map((t) => t.amount)).toEqual(['1.00']);
    });

    it('returns an empty list, not an error, for a page out of range (case 18)', async () => {
      await move(ctx, 'deposits', '1.00', 't1');
      const res = await list('?page=99');

      expect(res.status).toBe(200);
      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('only lists the authenticated user transactions', async () => {
      await move(ctx, 'deposits', '5.00', 'l1', ctx.luisToken);
      const res = await list();
      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it.each(['?page=0', '?page=-1', '?page=abc', '?pageSize=0', '?pageSize=101', '?page=1.5'])(
      'rejects invalid pagination %s with 400',
      async (query) => {
        const res = await list(query);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', message: 'Query parameters are invalid' } });
      },
    );
  });
});
