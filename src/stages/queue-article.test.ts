// src/stages/queue-article.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { queueArticle } from './queue-article';

describe('queueArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    process.env.PUBLISH_HOUR_UTC = '9';
  });
  afterAll(async () => { await closeDb(); });

  it('schedules first article for tomorrow at 09:00 UTC', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'image_ready', slug: 's',
    }).returning();
    const before = new Date();
    await queueArticle(a.id);
    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('scheduled');
    expect(row.scheduledAt).toBeDefined();
    const scheduled = new Date(row.scheduledAt!);
    expect(scheduled.getUTCHours()).toBe(9);
    expect(scheduled.getTime()).toBeGreaterThan(before.getTime());
  });

  it('schedules second article exactly 24h after the latest scheduled', async () => {
    const existing = new Date(Date.UTC(2099, 0, 10, 9, 0, 0));
    await db().insert(articles).values({
      keyword: 'prior', category: 'exchanges', status: 'scheduled',
      slug: 'prior', scheduledAt: existing,
    });
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'image_ready', slug: 's',
    }).returning();

    await queueArticle(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    const scheduled = new Date(row.scheduledAt!);
    expect(scheduled.getUTCFullYear()).toBe(2099);
    expect(scheduled.getUTCMonth()).toBe(0);
    expect(scheduled.getUTCDate()).toBe(11);
    expect(scheduled.getUTCHours()).toBe(9);
  });
});
