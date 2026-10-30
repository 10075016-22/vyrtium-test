import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { findUserByEmail } from '../users/users.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueAccessToken, type IssuedToken } from './tokens.js';

// Verified when the email does not exist, so both failure paths cost one scrypt
// and response time does not reveal which emails are registered.
let dummyHash: Promise<string> | undefined;

export async function login(
  db: Db,
  config: Pick<Config, 'jwtSecret' | 'jwtTtlSeconds'>,
  email: string,
  password: string,
): Promise<IssuedToken> {
  const user = findUserByEmail(db, email);
  dummyHash ??= hashPassword('dummy-password');
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return issueAccessToken(user.id, config.jwtSecret, config.jwtTtlSeconds);
}
