// src/stages/queue-article.ts
import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { articles } from '../db/schema';
import { TerminalError } from '../lib/errors';

export async function queueArticle(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);

  const hour = Number(process.env.PUBLISH_HOUR_UTC ?? '9');
  const scheduledAt = await getNextSlot(hour);

  await db().update(articles).set({
    status: 'scheduled',
    scheduledAt,
  }).where(eq(articles.id, articleId));
}

async function getNextSlot(publishHourUtc: number): Promise<Date> {
  const [latest] = await db()
    .select({ scheduledAt: articles.scheduledAt })
    .from(articles)
    .where(inArray(articles.status, ['scheduled', 'published']))
    .orderBy(desc(articles.scheduledAt))
    .limit(1);

  const base = latest?.scheduledAt ? new Date(latest.scheduledAt) : new Date();
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(publishHourUtc, 0, 0, 0);

  // Never schedule in the past
  const earliest = new Date();
  earliest.setUTCHours(earliest.getUTCHours() + 1);
  if (next < earliest) {
    next.setUTCDate(new Date().getUTCDate() + 1);
    next.setUTCHours(publishHourUtc, 0, 0, 0);
  }
  return next;
}
