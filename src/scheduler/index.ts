// src/scheduler/index.ts
import cron from 'node-cron';

import { env } from '../config/env';
import { logger } from '../lib/logger';
import { notifyWebhook } from '../lib/webhook';
import { discoverKeywords } from '../stages/discover-keywords';
import { harvestKeywords } from '../stages/harvest-keywords';
import { driveArticle } from '../stages/drive-article';
import { publishDue } from '../stages/publish-due';
import { monitorDiversity } from '../stages/monitor-diversity';
import { getArticle } from '../db/queries';

type Handler = () => Promise<void>;

async function driveDailyBatch(): Promise<void> {
  const n = env().ARTICLES_PER_DAY;
  // Track ids already attempted in this batch so a single poisoned article
  // can't monopolise both ticks (May 2026 incident: one bad brief blocked the
  // entire day's batch by re-being picked as the oldest retryable).
  const attempted: string[] = [];
  // Track categories already driven so the day's articles never share a
  // category — the "unique category per day" requirement. Without this, when
  // topic cooldown filters out every other category's candidates the batch
  // collapses onto one category (June 2026 fear-and-greed incident: 4 straight
  // days of 2 analysis articles each).
  const drivenCategories = new Set<string>();
  let driven = 0;
  for (let i = 0; i < n; i++) {
    const id = await driveArticle(attempted, [...drivenCategories]);
    if (!id) break;
    attempted.push(id);
    const art = await getArticle(id);
    if (art?.category) drivenCategories.add(art.category);
    if (art?.status === 'scheduled') driven++;
  }
  // Fail safe: publishing FEWER articles is correct when no fresh topic in a
  // new category is available. A light day beats a repetitive one. Alert so the
  // queue gets re-stocked rather than silently degrading.
  if (driven < n) {
    logger.warn({ target: n, driven }, 'daily batch under-filled');
    await notifyWebhook(env().WEBHOOK_URL, {
      event: 'batch_underfilled',
      target: n,
      driven,
      reason: 'no fresh topic available in an undriven category (topic cooldown / queue starvation)',
    });
  }
}

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

  // Daily 03:00 UTC — drive ARTICLES_PER_DAY articles in a row through the
  // pipeline (research → outline → write → image → queue). All of them queue
  // for the same next-PUBLISH_HOUR_UTC slot, so they publish as a batch.
  cron.schedule('0 3 * * *', () => run('driveDailyBatch', driveDailyBatch), { timezone: 'UTC' });

  // Hourly :00 — publish articles whose scheduledAt <= now
  cron.schedule('0 * * * *', () => run('publishDue', publishDue), { timezone: 'UTC' });

  // Daily 04:00 UTC — recurrence watchdog. Alerts if the recently-published
  // feed has collapsed onto too few categories or one topic, so a future
  // saturation regression is caught automatically instead of by a human noticing.
  cron.schedule('0 4 * * *', () => run('monitorDiversity', monitorDiversity), { timezone: 'UTC' });

  logger.info('scheduler started: 5 cron jobs registered (UTC)');
}
