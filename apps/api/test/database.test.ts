import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/auth/password.js';
import { migrate, openDatabase } from '../src/db/database.js';
import { migrations } from '../src/db/migrations.js';
import { SEED_USERS, seedUsers } from '../src/db/seed.js';

describe('database', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => {
      rmSync(dir, { recursive: true, force: true });
    });
  });

  it('applies every migration once and records the schema version', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);

    expect(() => {
      migrate(db);
    }).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);
  });

  it('creates the parent directory of a file database and persists across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbita-'));
    tempDirs.push(dir);
    const path = join(dir, 'nested', 'orbita.db');

    const first = openDatabase(path);
    await seedUsers(first);
    first.close();

    const second = openDatabase(path);
    const count = second.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users').get();
    second.close();
    expect(count?.n).toBe(SEED_USERS.length);
  });

  it('seeds idempotently and keeps the original password hash', async () => {
    const db = openDatabase(':memory:');
    await seedUsers(db);
    const before = db.prepare('SELECT id, password_hash FROM users ORDER BY id').all();

    await seedUsers(db);
    const after = db.prepare('SELECT id, password_hash FROM users ORDER BY id').all();

    expect(after).toEqual(before);
    expect(after.map((row) => (row as { id: string }).id)).toContain('u_123');
  });

  it('enforces unique emails regardless of case', async () => {
    const db = openDatabase(':memory:');
    await seedUsers(db);
    expect(() =>
      db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u_x', 'ANA@ORBITA.TEST', 'h')").run(),
    ).toThrow(/UNIQUE/);
  });
});

describe('password hashing', () => {
  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('x', 'plain-text')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$')).resolves.toBe(false);
  });
});
