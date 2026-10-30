import express, { type Express } from 'express';
import cors from 'cors';
import type { Config } from './config.js';

export function createApp(config: Config): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
