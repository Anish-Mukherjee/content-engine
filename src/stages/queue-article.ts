// src/stages/queue-article.ts
import { eq } from 'drizzle-orm';

import { env } from '../config/env';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { TerminalError } from '../lib/errors';

export async function queueArticle(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);

  const hour = env().PUBLISH_HOUR_UTC;
  const scheduledAt = getNextSlot(hour, new Date());

  await db().update(articles).set({
    status: 'scheduled',
    scheduledAt,
  }).where(eq(articles.id, articleId));
}

// Returns the next occurrence of `publishHourUtc` at least one hour from
// `now`. Multiple articles queued in the same tick get the same slot —
// intentional, so a daily batch publishes together. The unused drizzle
// imports kept for future use are pruned.
export function getNextSlot(publishHourUtc: number, now: Date): Date {
  const earliest = new Date(now.getTime() + 60 * 60 * 1000); // now + 1h
  const today = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    publishHourUtc, 0, 0, 0
  ));
  if (today >= earliest) return today;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
}
