import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret',
      WEBHOOK_SECRET: 'test-webhook-secret',
      DATABASE_PATH: ':memory:',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entrypoint only wires config and listen(); covered by running the app.
      exclude: ['src/server.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
