import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads secrets and numeric settings from the environment', () => {
    vi.stubEnv('PORT', '4000');
    vi.stubEnv('JWT_TTL_SECONDS', '60');

    expect(loadConfig()).toMatchObject({
      port: 4000,
      jwtSecret: 'test-jwt-secret',
      jwtTtlSeconds: 60,
      webhookSecret: 'test-webhook-secret',
    });
  });

  it('falls back to defaults for optional settings', () => {
    vi.stubEnv('PORT', '');
    vi.stubEnv('JWT_TTL_SECONDS', undefined);
    vi.stubEnv('DATABASE_PATH', undefined);
    vi.stubEnv('CORS_ORIGIN', undefined);

    expect(loadConfig()).toMatchObject({
      port: 3000,
      jwtTtlSeconds: 1800,
      databasePath: './data/orbita.db',
      corsOrigin: 'http://localhost:5173',
      idempotencyTtlHours: 24,
    });
  });

  it.each(['JWT_SECRET', 'WEBHOOK_SECRET'])('fails fast when %s is missing', (name) => {
    vi.stubEnv(name, '');
    expect(() => loadConfig()).toThrow(`Missing required environment variable: ${name}`);
  });

  it.each(['0', '-5', 'abc'])('rejects a non-positive integer TTL (%s)', (value) => {
    vi.stubEnv('JWT_TTL_SECONDS', value);
    expect(() => loadConfig()).toThrow('JWT_TTL_SECONDS must be a positive integer');
  });
});
