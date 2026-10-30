function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
}

export interface Config {
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  webhookSecret: string;
  corsOrigin: string;
}

export function loadConfig(): Config {
  return {
    port: integer('PORT', 3000),
    databasePath: process.env.DATABASE_PATH ?? './data/orbita.db',
    jwtSecret: required('JWT_SECRET'),
    jwtTtlSeconds: integer('JWT_TTL_SECONDS', 1800),
    webhookSecret: required('WEBHOOK_SECRET'),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  };
}
