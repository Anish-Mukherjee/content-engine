// src/stages/queue-article.ts
import { desc, eq, inArray } from 'drizzle-orm';

import { env } from '../config/env';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { TerminalError } from '../lib/errors';

export async function queueArticle(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);

  const hours = env().PUBLISH_HOURS_UTC;
  const scheduledAt = await getNextSlot(hours, new Date());

  await db().update(articles).set({
    status: 'scheduled',
    scheduledAt,
  }).where(eq(articles.id, articleId));
}

// Pick the earliest hour-slot strictly greater than the cursor, where the
// cursor = max(latest already-scheduled time, now + 1h buffer). Walks forward
// up to 7 days as a defensive bound; the inner loop almost always returns on
// the first day.
export async function getNextSlot(hours: readonly number[], now: Date): Promise<Date> {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error('getNextSlot: hours must contain at least one element');
  }

  const [latest] = await db()
    .select({ scheduledAt: articles.scheduledAt })
    .from(articles)
    .where(inArray(articles.status, ['scheduled', 'published']))
    .orderBy(desc(articles.scheduledAt))
    .limit(1);

  const earliest = new Date(now.getTime() + 60 * 60 * 1000); // now + 1h
  const latestAt = latest?.scheduledAt ? new Date(latest.scheduledAt) : null;
  const cursor = latestAt && latestAt > earliest ? latestAt : earliest;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(Date.UTC(
      cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + dayOffset
    ));
    for (const hour of sorted) {
      const slot = new Date(day);
      slot.setUTCHours(hour, 0, 0, 0);
      if (slot > cursor) return slot;
    }
  }
  throw new Error('getNextSlot: no slot found in 7 days (should be unreachable)');
}
