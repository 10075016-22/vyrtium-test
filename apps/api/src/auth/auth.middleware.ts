import type { Request, RequestHandler } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { userExists } from '../users/users.repository.js';
import { readCookie, SESSION_COOKIE } from './session-cookie.js';
import { verifyAccessToken } from './tokens.js';

const BEARER = /^Bearer ([^\s]+)$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const authenticatedUsers = new WeakMap<Request, string>();

/**
 * Resolves the user exclusively from the access token: the `Authorization:
 * Bearer` header (API clients) or, if absent, the HttpOnly session cookie (the
 * web app). Any user id sent in headers, query or body is never read.
 *
 * A cookie is sent by the browser automatically, so cookie-authenticated writes
 * must also come from the web app's origin (CSRF defense on top of
 * SameSite=Strict). A bearer header is never added by the browser on its own,
 * so it needs no such check.
 */
export function requireAuth(db: Db, config: Pick<Config, 'jwtSecret' | 'corsOrigin'>): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization');
    let token: string;

    if (header) {
      const match = BEARER.exec(header);
      if (!match?.[1]) {
        throw new AppError(401, 'INVALID_TOKEN', 'Authorization header must be "Bearer <token>"');
      }
      token = match[1];
    } else {
      const cookie = readCookie(req.get('cookie'), SESSION_COOKIE);
      if (!cookie) {
        throw new AppError(401, 'MISSING_TOKEN', 'Authorization header or session cookie is required');
      }
      if (!SAFE_METHODS.has(req.method) && req.get('origin') !== config.corsOrigin) {
        throw new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed');
      }
      token = cookie;
    }

    const userId = verifyAccessToken(token, config.jwtSecret);
    if (!userExists(db, userId)) {
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
    }

    authenticatedUsers.set(req, userId);
    next();
  };
}

/** User id set by `requireAuth`. Throws if the route was mounted without it. */
export function getUserId(req: Request): string {
  const userId = authenticatedUsers.get(req);
  if (!userId) {
    throw new Error('getUserId called on a route without requireAuth');
  }
  return userId;
}
