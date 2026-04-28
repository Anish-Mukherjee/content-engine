// Push already-published (or in-flight) articles back to the schedule queue.
// Use case: editorial wants to retract a live post temporarily without
// deleting it. Sets status=scheduled, parks scheduledAt at the back of the
// queue, and revalidates the frontend so the slug 404s immediately.
//
// Usage: npx tsx scripts/requeue-articles.ts <slug> [<slug> ...]
import 'dotenv/config';

import { eq, inArray, desc } from 'drizzle-orm';

import { env } from '../src/config/env';
import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { revalidate } from '../src/integrations/frontend';
import { logger } from '../src/lib/logger';

async function nextSlotAfter(latest: Date | null): Promise<Date> {
  const hours = [...new Set(env().PUBLISH_HOURS_UTC)].sort((a, b) => a - b);
  const now = new Date();
  const earliest = new Date(now.getTime() + 60 * 60 * 1000);
  const cursor = latest && latest > earliest ? latest : earliest;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(Date.UTC(
      cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + dayOffset
    ));
    for (const hour of hours) {
      const slot = new Date(day);
      slot.setUTCHours(hour, 0, 0, 0);
      if (slot > cursor) return slot;
    }
  }
  throw new Error('nextSlotAfter: no slot found in 7 days');
}

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    logger.error('usage: npx tsx scripts/requeue-articles.ts <slug> [<slug> ...]');
    process.exit(1);
  }

  // Find the back of the existing queue once; we'll fan out from there.
  const [latest] = await db()
    .select({ scheduledAt: articles.scheduledAt })
    .from(articles)
    .where(inArray(articles.status, ['scheduled', 'published']))
    .orderBy(desc(articles.scheduledAt))
    .limit(1);
  let cursor: Date | null = latest?.scheduledAt ? new Date(latest.scheduledAt) : null;

  const requeued: string[] = [];
  for (const slug of slugs) {
    const [row] = await db()
      .select({ id: articles.id, status: articles.status, slug: articles.slug })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!row) {
      logger.warn({ slug }, 'article not found — skipping');
      continue;
    }

    cursor = await nextSlotAfter(cursor);
    await db().update(articles)
      .set({ status: 'scheduled', scheduledAt: cursor, publishedAt: null })
      .where(eq(articles.id, row.id));
    logger.info({ slug, prevStatus: row.status, scheduledAt: cursor }, 'requeued');
    requeued.push(slug);
  }

  if (requeued.length > 0) {
    const paths = ['/blog', '/', ...requeued.map((s) => `/blog/${s}`)];
    await revalidate(paths);
    logger.info({ paths }, 'revalidate called');
  }

  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, 'requeue failed');
  process.exit(1);
});
