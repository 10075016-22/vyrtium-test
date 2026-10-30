import express, { type Express } from 'express';
import cors from 'cors';
import { authRouter } from './auth/auth.routes.js';
import { balancesRouter } from './balances/balances.routes.js';
import type { Config } from './config.js';
import type { Db } from './db/database.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { webhooksRouter } from './webhooks/webhooks.routes.js';

export interface AppDeps {
  config: Config;
  db: Db;
}

export function createApp({ config, db }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  // credentials: the browser sends the session cookie only to an origin that allows it.
  app.use(cors({ origin: config.corsOrigin, credentials: true }));

  // Before express.json(): the webhook needs the raw bytes to verify the HMAC.
  app.use('/webhooks', webhooksRouter(db, config));

  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter(db, config));
  app.use('/balances', balancesRouter(db, config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
