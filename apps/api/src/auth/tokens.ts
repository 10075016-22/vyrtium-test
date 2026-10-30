import jwt from 'jsonwebtoken';
import { AppError } from '../http/errors.js';

const ALGORITHM = 'HS256';

export interface IssuedToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export function issueAccessToken(userId: string, secret: string, ttlSeconds: number): IssuedToken {
  const accessToken = jwt.sign({}, secret, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: ttlSeconds,
  });
  return { accessToken, tokenType: 'Bearer', expiresIn: ttlSeconds };
}

/** Returns the user id (`sub`) of a valid token; throws a 401 AppError otherwise. */
export function verifyAccessToken(token: string, secret: string): string {
  let payload: string | jwt.JwtPayload;
  try {
    // Pinning the algorithm blocks `alg: none` and algorithm-confusion tokens.
    payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }

  if (typeof payload === 'string' || !payload.sub) {
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  return payload.sub;
}
