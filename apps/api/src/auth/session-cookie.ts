import type { CookieOptions } from 'express';
import type { Config } from '../config.js';

export const SESSION_COOKIE = 'orbita_session';

/**
 * HttpOnly: page scripts (and therefore an XSS payload) cannot read the token.
 * SameSite=Strict: other sites cannot make the browser send it.
 */
export function sessionCookieOptions(config: Pick<Config, 'cookieSecure'>): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' };
}

/** Reads one cookie from a raw `Cookie` header without pulling in a parser dependency. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value === '' ? undefined : decodeURIComponent(value);
    }
  }
  return undefined;
}
