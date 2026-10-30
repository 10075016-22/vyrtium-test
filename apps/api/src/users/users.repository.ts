import type { Db } from '../db/database.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

const SELECT_USER = 'SELECT id, email, password_hash AS passwordHash FROM users';

export function findUserByEmail(db: Db, email: string): UserRecord | undefined {
  return db.prepare<[string], UserRecord>(`${SELECT_USER} WHERE email = ?`).get(email);
}

export function userExists(db: Db, id: string): boolean {
  return db.prepare<[string], { found: number }>('SELECT 1 AS found FROM users WHERE id = ?').get(id) !== undefined;
}

export function insertUserIfAbsent(db: Db, user: UserRecord): void {
  db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    user.id,
    user.email,
    user.passwordHash,
  );
}
