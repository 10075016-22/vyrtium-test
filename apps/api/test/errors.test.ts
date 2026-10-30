import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('error format', () => {
  it('responds 404 in the shared JSON format for unknown routes', async () => {
    const { app } = await createTestContext();
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /nope not found' } });
  });
});
