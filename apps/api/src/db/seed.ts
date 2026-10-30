import { hashPassword } from '../auth/password.js';
import { findUserByEmail, insertUserIfAbsent } from '../users/users.repository.js';
import type { Db } from './database.js';

// Demo credentials, documented in the README. Only the scrypt hash is stored.
export const SEED_USERS = [
  { id: 'u_123', email: 'ana@orbita.test', password: 'Orbita-Ana-2026' },
  { id: 'u_456', email: 'luis@orbita.test', password: 'Orbita-Luis-2026' },
  { id: 'u_789', email: 'maria@orbita.test', password: 'Orbita-Maria-2026' },
  { id: 'u_321', email: 'carlos@orbita.test', password: 'Orbita-Carlos-2026' },
  { id: 'u_654', email: 'sofia@orbita.test', password: 'Orbita-Sofia-2026' },
] as const;

/** Idempotent: existing users are left untouched. */
export async function seedUsers(db: Db): Promise<void> {
  for (const user of SEED_USERS) {
    if (findUserByEmail(db, user.email)) continue;
    insertUserIfAbsent(db, {
      id: user.id,
      email: user.email,
      passwordHash: await hashPassword(user.password),
    });
  }
}
