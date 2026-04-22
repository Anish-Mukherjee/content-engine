// src/scheduler/index.ts
import cron from 'node-cron';

import { env } from '../config/env';
import { logger } from '../lib/logger';
import { notifyWebhook } from '../lib/webhook';
import { discoverKeywords } from '../stages/discover-keywords';
import { harvestKeywords } from '../stages/harvest-keywords';
import { driveArticle } from '../stages/drive-article';
import { publishDue } from '../stages/publish-due';

type Handler = () => Promise<void>;

async function run(name: string, handler: Handler): Promise<void> {
  const started = Date.now();
  logger.info({ cron: name }, 'cron tick start');
  try {
    await handler();
    logger.info({ cron: name, durationMs: Date.now() - started }, 'cron tick ok');
  } catch (err) {
    logger.error({ err, cron: name, durationMs: Date.now() - started }, 'cron tick failed');
    await notifyWebhook(env().WEBHOOK_URL, {
      event: 'cron_failed',
      cron: name,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startScheduler(): void {
  if (env().DISABLE_CRON) {
    logger.warn('DISABLE_CRON=true — scheduler not starting');
    return;
  }

  // Weekly: Sunday 00:00 UTC — submit DataForSEO tasks
  cron.schedule('0 0 * * 0', () => run('discoverKeywords', discoverKeywords), { timezone: 'UTC' });

  // Hourly :15 — harvest completed DataForSEO tasks + filter
  cron.schedule('15 * * * *', () => run('harvestKeywords', harvestKeywords), { timezone: 'UTC' });

  // Daily 03:00 UTC — advance one article pending → scheduled
  cron.schedule('0 3 * * *', () => run('driveArticle', driveArticle), { timezone: 'UTC' });

  // Hourly :00 — publish articles whose scheduledAt <= now
  cron.schedule('0 * * * *', () => run('publishDue', publishDue), { timezone: 'UTC' });

  logger.info('scheduler started: 4 cron jobs registered (UTC)');
}
