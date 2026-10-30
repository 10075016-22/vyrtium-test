import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { SEED_USERS, seedUsers } from '../src/db/seed.js';

export const [ANA, LUIS] = SEED_USERS;

/** Fresh in-memory database and app per call, so tests never share state. */
export async function createTestContext() {
  const config = loadConfig();
  const db = openDatabase(':memory:');
  await seedUsers(db);
  const app = createApp({ config, db });
  return { config, db, app };
}

export async function loginAs(
  app: Parameters<typeof request>[0],
  user: { email: string; password: string },
): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email: user.email, password: user.password });
  return (res.body as { accessToken: string }).accessToken;
}
