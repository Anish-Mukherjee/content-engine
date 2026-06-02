// src/stages/monitor-diversity.ts
//
// Recurrence watchdog. The June 2026 fear-and-greed incident went unnoticed for
// days because nothing watched the published feed for topic collapse. This
// stage inspects the most recent published articles and alerts (via webhook) if
// the feed has collapsed onto too few categories or one repeated topic — so the
// NEXT saturation regression (any emerging clusterless topic) is caught
// automatically instead of by a human eventually noticing.
import { desc, eq } from 'drizzle-orm';

import { env } from '../config/env';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { saturationTags } from '../config/topic-clusters';
import { logger } from '../lib/logger';
import { notifyWebhook } from '../lib/webhook';

// Tunable thresholds. Reviewed alongside ARTICLES_PER_DAY.
export const MONITOR_LOOKBACK = 14;        // recent published articles to inspect
export const MIN_DISTINCT_CATEGORIES = 4;  // alert if fewer distinct categories than this
export const MAX_SAME_TOPIC = 4;           // alert if any saturation tag repeats more than this

export type DiversityReport = {
  sampled: number;
  distinctCategories: number;
  topTopic: { tag: string; count: number } | null;
  anomalies: string[];
};

// Pure core — no DB — so it is trivially unit-testable.
export function analyzeDiversity(rows: Array<{ category: string; keyword: string }>): DiversityReport {
  const cats = new Set<string>();
  const tagCounts = new Map<string, number>();
  for (const r of rows) {
    cats.add(r.category);
    for (const t of saturationTags(r.keyword)) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  let topTopic: { tag: string; count: number } | null = null;
  for (const [tag, count] of tagCounts) {
    if (!topTopic || count > topTopic.count) topTopic = { tag, count };
  }

  const anomalies: string[] = [];
  // Only judge category-spread once we have a full window (avoids false alerts
  // on a freshly-seeded site with few published rows).
  if (rows.length >= MONITOR_LOOKBACK && cats.size < MIN_DISTINCT_CATEGORIES) {
    anomalies.push(
      `only ${cats.size} distinct categories in last ${rows.length} published (min ${MIN_DISTINCT_CATEGORIES})`,
    );
  }
  if (topTopic && topTopic.count > MAX_SAME_TOPIC) {
    anomalies.push(
      `topic "${topTopic.tag}" appears ${topTopic.count}× in last ${rows.length} published (max ${MAX_SAME_TOPIC})`,
    );
  }

  return { sampled: rows.length, distinctCategories: cats.size, topTopic, anomalies };
}

export async function monitorDiversity(): Promise<void> {
  const rows = await db()
    .select({ category: articles.category, keyword: articles.keyword })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(MONITOR_LOOKBACK);

  const report = analyzeDiversity(rows);
  if (report.anomalies.length === 0) {
    logger.info({ report }, 'diversity watchdog ok');
    return;
  }

  logger.warn({ report }, 'diversity watchdog: feed repetition detected');
  await notifyWebhook(env().WEBHOOK_URL, { event: 'feed_repetition', ...report });
}
