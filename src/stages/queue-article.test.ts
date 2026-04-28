// src/stages/queue-article.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { queueArticle, getNextSlot } from './queue-article';

describe('queueArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    process.env.PUBLISH_HOUR_UTC = '9';
  });
  afterAll(async () => { await closeDb(); });

  it('schedules an article for the next 09:00 UTC slot', async () => {
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

  it('queues two consecutive articles for the SAME slot (same-time batch)', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'a', category: 'exchanges', status: 'image_ready', slug: 'a',
    }).returning();
    const [b] = await db().insert(articles).values({
      keyword: 'b', category: 'exchanges', status: 'image_ready', slug: 'b',
    }).returning();

    await queueArticle(a.id);
    await queueArticle(b.id);

    const [rowA] = await db().select().from(articles).where(eq(articles.id, a.id));
    const [rowB] = await db().select().from(articles).where(eq(articles.id, b.id));
    expect(new Date(rowA.scheduledAt!).toISOString()).toBe(new Date(rowB.scheduledAt!).toISOString());
  });
});

// getNextSlot is pure (no DB) so the cases below cover the full surface.
describe('getNextSlot', () => {
  it('returns today at the publish hour when now+1h is still before it', () => {
    const now = new Date(Date.UTC(2099, 0, 10, 7, 30, 0));
    expect(getNextSlot(9, now).toISOString()).toBe('2099-01-10T09:00:00.000Z');
  });

  it('returns tomorrow when today\'s slot has already passed (now > publish hour)', () => {
    const now = new Date(Date.UTC(2099, 0, 10, 10, 0, 0));
    expect(getNextSlot(9, now).toISOString()).toBe('2099-01-11T09:00:00.000Z');
  });

  it('returns tomorrow when today\'s slot is within the now+1h buffer', () => {
    // now=02:30, publish=03:00 — today's slot is 30 min away (< 1h buffer) → tomorrow.
    const now = new Date(Date.UTC(2099, 0, 10, 2, 30, 0));
    expect(getNextSlot(3, now).toISOString()).toBe('2099-01-11T03:00:00.000Z');
  });

  it('two calls in quick succession return the same slot (no per-article spacing)', () => {
    const now = new Date(Date.UTC(2099, 0, 10, 1, 0, 0));
    expect(getNextSlot(3, now).toISOString()).toBe('2099-01-10T03:00:00.000Z');
    expect(getNextSlot(3, now).toISOString()).toBe('2099-01-10T03:00:00.000Z');
  });
});
