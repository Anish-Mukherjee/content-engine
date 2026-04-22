// src/server/routes/health.ts
import { Router } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../db/client';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await db().execute(sql`SELECT 1`);
    res.json({ ok: true, service: 'content-pipeline' });
  } catch {
    res.status(503).json({ ok: false });
  }
});
