import express, { type Express } from 'express';
import cors from 'cors';
import { authRouter } from './auth/auth.routes.js';
import type { Config } from './config.js';
import type { Db } from './db/database.js';
import { errorHandler, notFoundHandler } from './http/errors.js';

export interface AppDeps {
  config: Config;
  db: Db;
}

export function createApp({ config, db }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter(db, config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
