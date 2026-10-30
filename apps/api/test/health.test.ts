import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('GET /health', () => {
  it('responds ok', async () => {
    const { app } = await createTestContext();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
