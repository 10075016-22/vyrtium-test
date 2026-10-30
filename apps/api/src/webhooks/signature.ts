import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../http/errors.js';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

export function signPayload(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Verifies `X-Signature` (hex HMAC-SHA256) over the exact bytes received.
 * Re-serializing the parsed JSON would change spacing or key order and break
 * valid signatures, so the raw buffer is the only input that is correct.
 */
export function assertValidSignature(rawBody: Buffer, signature: string | undefined, secret: string): void {
  if (!signature) {
    throw new AppError(401, 'MISSING_SIGNATURE', 'X-Signature header is required');
  }

  const expected = Buffer.from(signPayload(rawBody, secret), 'hex');
  // Format check first: Buffer.from(hex) silently drops invalid characters,
  // and timingSafeEqual throws on buffers of different length.
  const received = HEX_SHA256.test(signature) ? Buffer.from(signature, 'hex') : undefined;

  if (!received || !timingSafeEqual(received, expected)) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'X-Signature does not match the request body');
  }
}
