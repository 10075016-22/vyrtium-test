import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db/database.js';
import { parseBody } from '../http/validation.js';
import { login } from './auth.service.js';

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

export function authRouter(db: Db, config: Config): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    res.json(await login(db, config, email, password));
  });

  return router;
}
