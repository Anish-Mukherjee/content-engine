// src/index.ts
import 'dotenv/config';

import { env } from './config/env';
import { closeDb } from './db/client';
import { logger } from './lib/logger';
import { createApp } from './server/app';
import { startScheduler } from './scheduler';

async function main(): Promise<void> {
  const parsed = env();  // validates all required env vars

  const app = createApp();
  const server = app.listen(parsed.PORT, () => {
    logger.info({ port: parsed.PORT }, 'content-pipeline listening');
  });

  startScheduler();

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'boot failed');
  process.exit(1);
});
