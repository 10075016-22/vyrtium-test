import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA, createTestContext } from './helpers.js';

describe('POST /auth/login', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('returns a bearer token whose subject is the user id and that expires', async () => {
    const res = await request(ctx.app).post('/auth/login').send({ email: ANA.email, password: ANA.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: ctx.config.jwtTtlSeconds });

    const payload = jwt.verify((res.body as { accessToken: string }).accessToken, ctx.config.jwtSecret) as jwt.JwtPayload;
    expect(payload.sub).toBe(ANA.id);
    expect(payload.exp).toBe((payload.iat ?? 0) + ctx.config.jwtTtlSeconds);
  });

  it('matches the email case-insensitively', async () => {
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: ANA.email.toUpperCase(), password: ANA.password });
    expect(res.status).toBe(200);
  });

  it('returns the exact same error for a wrong password and for an unknown email', async () => {
    const wrongPassword = await request(ctx.app)
      .post('/auth/login')
      .send({ email: ANA.email, password: 'not-the-password' });
    const unknownEmail = await request(ctx.app)
      .post('/auth/login')
      .send({ email: 'nobody@orbita.test', password: ANA.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  });

  it('does not store passwords in plain text', () => {
    const row = ctx.db.prepare<[string], { hash: string }>('SELECT password_hash AS hash FROM users WHERE id = ?').get(ANA.id);
    expect(row?.hash).toMatch(/^scrypt\$/);
    expect(row?.hash).not.toContain(ANA.password);
  });

  it.each([
    ['missing fields', {}],
    ['malformed email', { email: 'not-an-email', password: 'x' }],
    ['empty password', { email: ANA.email, password: '' }],
    ['non-string password', { email: ANA.email, password: 123 }],
  ])('rejects %s with a validation error', async (_case, body) => {
    const res = await request(ctx.app).post('/auth/login').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect((res.body as { error: { details: unknown[] } }).error.details.length).toBeGreaterThan(0);
  });

  it('rejects a malformed JSON body with a JSON error, not a stack trace', async () => {
    const res = await request(ctx.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  });

  it('rejects an oversized body', async () => {
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: ANA.email, password: 'x'.repeat(20_000) });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
