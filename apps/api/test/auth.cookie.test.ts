import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { readCookie } from '../src/auth/session-cookie.js';
import { ANA, LUIS, createTestContext, loginAs } from './helpers.js';

const ORIGIN = 'http://localhost:5173'; // CORS_ORIGIN default in tests

describe('session cookie', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  async function loginCookie(user: { email: string; password: string } = ANA): Promise<string> {
    const res = await request(ctx.app).post('/auth/login').send({ email: user.email, password: user.password });
    const setCookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    return setCookie.split(';')[0] ?? '';
  }

  it('sets an HttpOnly, SameSite=Strict cookie with the token lifetime on login, and still returns the token', async () => {
    const res = await request(ctx.app).post('/auth/login').send({ email: ANA.email, password: ANA.password });
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';

    expect(res.body).toMatchObject({ tokenType: 'Bearer', accessToken: expect.any(String) as unknown });
    expect(setCookie).toMatch(/^orbita_session=[^;]+;/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${String(ctx.config.jwtTtlSeconds)}`);
    expect(setCookie).not.toContain('Secure');
  });

  it('does not set a cookie when the login fails', async () => {
    const res = await request(ctx.app).post('/auth/login').send({ email: ANA.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('authenticates reads with the cookie alone', async () => {
    const cookie = await loginCookie();
    const res = await request(ctx.app).get('/balances/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('GET /auth/me returns the user behind the cookie', async () => {
    const cookie = await loginCookie(LUIS);
    const res = await request(ctx.app).get('/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: LUIS.id, email: LUIS.email });
  });

  it('GET /auth/me responds 401 without a session', async () => {
    const res = await request(ctx.app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'MISSING_TOKEN' } });
  });

  it('rejects a tampered cookie with 401 INVALID_TOKEN', async () => {
    const cookie = await loginCookie();
    const res = await request(ctx.app).get('/auth/me').set('Cookie', `${cookie.slice(0, -2)}xx`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  describe('CSRF protection on cookie-authenticated writes', () => {
    function deposit(headers: Record<string, string>) {
      const req = request(ctx.app).post('/balances/me/deposits').set('Idempotency-Key', 'csrf-1');
      for (const [name, value] of Object.entries(headers)) req.set(name, value);
      return req.send({ amount: '10.00', currency: 'USD' });
    }

    it('accepts a write from the web app origin', async () => {
      const res = await deposit({ Cookie: await loginCookie(), Origin: ORIGIN });
      expect(res.status).toBe(201);
    });

    it.each([
      ['no Origin header', {}],
      ['another origin', { Origin: 'https://evil.example' }],
    ])('rejects a cookie write with %s (403, no money moves)', async (_case, extra) => {
      const res = await deposit({ Cookie: await loginCookie(), ...extra });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { code: 'CSRF_REJECTED', message: 'Request origin is not allowed' } });
      const balance = await request(ctx.app).get('/balances/me').set('Cookie', await loginCookie());
      expect(balance.body).toMatchObject({ amount: '0.00' });
    });

    it('does not apply to bearer tokens, which browsers never attach on their own', async () => {
      const token = await loginAs(ctx.app, ANA);
      const res = await deposit({ Authorization: `Bearer ${token}` });
      expect(res.status).toBe(201);
    });
  });

  it('prefers the Authorization header over the cookie', async () => {
    const luisCookie = await loginCookie(LUIS);
    const anaToken = await loginAs(ctx.app, ANA);
    const res = await request(ctx.app)
      .get('/auth/me')
      .set('Cookie', luisCookie)
      .set('Authorization', `Bearer ${anaToken}`);
    expect(res.body).toMatchObject({ id: ANA.id });
  });

  it('POST /auth/logout clears the cookie', async () => {
    const res = await request(ctx.app).post('/auth/logout').set('Cookie', await loginCookie());
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';

    expect(res.status).toBe(204);
    expect(setCookie).toMatch(/^orbita_session=;/);
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(setCookie).toContain('HttpOnly');
  });

  it('allows the web origin to send credentials (CORS)', async () => {
    const res = await request(ctx.app)
      .options('/balances/me/deposits')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('readCookie', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['other=1', undefined],
    ['orbita_session=', undefined],
    ['broken; orbita_session=abc', 'abc'],
    ['a=1; orbita_session=a%2Bb; c=3', 'a+b'],
  ])('reads %j as %j', (header, expected) => {
    expect(readCookie(header, 'orbita_session')).toBe(expected);
  });
});
