import type { Request, RequestHandler } from 'express';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { userExists } from '../users/users.repository.js';
import { verifyAccessToken } from './tokens.js';

const BEARER = /^Bearer ([^\s]+)$/;
const authenticatedUsers = new WeakMap<Request, string>();

/**
 * Resolves the user exclusively from the bearer token. Any user id sent in
 * headers, query or body is never read by authenticated routes.
 */
export function requireAuth(db: Db, jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization');
    if (!header) {
      throw new AppError(401, 'MISSING_TOKEN', 'Authorization header is required');
    }

    const match = BEARER.exec(header);
    if (!match?.[1]) {
      throw new AppError(401, 'INVALID_TOKEN', 'Authorization header must be "Bearer <token>"');
    }

    const userId = verifyAccessToken(match[1], jwtSecret);
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
