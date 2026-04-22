// src/server/app.ts
import express from 'express';
import cors from 'cors';

import { healthRouter } from './routes/health';
import { articlesRouter } from './routes/articles';
import { imagesRouter } from './routes/images';
import { adminRouter } from './routes/admin';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  // CORS permitted globally; frontend ISR calls server-to-server, admin dashboard will
  // pass x-admin-key (custom header requires CORS if browser-origin).
  app.use(cors());

  app.use(healthRouter);
  app.use(articlesRouter);
  app.use(imagesRouter);
  app.use(adminRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'internal_error', message: err instanceof Error ? err.message : String(err) });
  });

  return app;
}
