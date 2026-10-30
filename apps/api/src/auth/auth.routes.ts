import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { parseBody } from '../http/validation.js';
import { findUserById } from '../users/users.repository.js';
import { getUserId, requireAuth } from './auth.middleware.js';
import { login } from './auth.service.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

export function authRouter(db: Db, config: Config): Router {
  const router = Router();

  // The token is returned in the body (API clients, as the spec requires) and also
  // set as an HttpOnly cookie, which is what the web app uses.
  router.post('/login', async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const token = await login(db, config, email, password);
    res.cookie(SESSION_COOKIE, token.accessToken, {
      ...sessionCookieOptions(config),
      maxAge: config.jwtTtlSeconds * 1000,
    });
    res.json(token);
  });

  // HttpOnly means page scripts cannot delete the cookie; the server does.
  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
    res.status(204).end();
  });

  // Lets the web app restore the session on reload without reading the token.
  router.get('/me', requireAuth(db, config), (req, res) => {
    res.json(findUserById(db, getUserId(req)));
  });

  return router;
}
