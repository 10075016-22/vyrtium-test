import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getUserId, requireAuth } from '../src/auth/auth.middleware.js';
import { errorHandler } from '../src/http/errors.js';
import { ANA, LUIS, createTestContext, loginAs } from './helpers.js';

// Minimal protected route: echoes the user resolved by the middleware.
async function setup() {
  const ctx = await createTestContext();
  const app = express();
  app.use(express.json());
  app.get('/whoami', requireAuth(ctx.db, ctx.config.jwtSecret), (req, res) => {
    res.json({ userId: getUserId(req) });
  });
  app.post('/whoami', requireAuth(ctx.db, ctx.config.jwtSecret), (req, res) => {
    res.json({ userId: getUserId(req) });
  });
  app.get('/unprotected', (req, res) => {
    res.json({ userId: getUserId(req) });
  });
  app.use(errorHandler);
  const anaToken = await loginAs(ctx.app, ANA);
  return { ...ctx, app, anaToken };
}

describe('requireAuth', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('resolves the user from a valid token', async () => {
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${ctx.anaToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: ANA.id });
  });

  it('ignores user ids sent in headers, query or body', async () => {
    const res = await request(ctx.app)
      .post(`/whoami?user_id=${LUIS.id}`)
      .set('Authorization', `Bearer ${ctx.anaToken}`)
      .set('X-User-Id', LUIS.id)
      .send({ user_id: LUIS.id, userId: LUIS.id });

    expect(res.body).toEqual({ userId: ANA.id });
  });

  it('responds 401 MISSING_TOKEN without an Authorization header', async () => {
    const res = await request(ctx.app).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'MISSING_TOKEN', message: 'Authorization header is required' } });
  });

  it.each([
    ['a non-bearer scheme', (t: string) => `Basic ${t}`],
    ['an empty bearer', () => 'Bearer '],
    ['a tampered signature', (t: string) => `Bearer ${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`],
    ['garbage', () => 'Bearer not.a.jwt'],
  ])('responds 401 INVALID_TOKEN for %s', async (_case, build) => {
    const res = await request(ctx.app).get('/whoami').set('Authorization', build(ctx.anaToken));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('responds 401 INVALID_TOKEN for a token signed with another secret', async () => {
    const forged = jwt.sign({}, 'attacker-secret', { subject: ANA.id, expiresIn: 60 });
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects unsigned tokens (alg: none)', async () => {
    const unsigned = jwt.sign({ sub: ANA.id }, '', { algorithm: 'none' });
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature without a subject', async () => {
    const noSubject = jwt.sign({}, ctx.config.jwtSecret, { expiresIn: 60 });
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${noSubject}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a valid token for a user that no longer exists', async () => {
    const ghost = jwt.sign({}, ctx.config.jwtSecret, { subject: 'u_ghost', expiresIn: 60 });
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${ghost}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('responds 401 TOKEN_EXPIRED for an expired token', async () => {
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, ctx.config.jwtSecret, { subject: ANA.id });
    const res = await request(ctx.app).get('/whoami').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' } });
  });

  it('fails loudly (500, no details leaked) if a route forgets requireAuth', async () => {
    const res = await request(ctx.app).get('/unprotected');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
  });
});
