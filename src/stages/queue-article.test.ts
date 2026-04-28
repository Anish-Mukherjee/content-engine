// src/stages/queue-article.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { queueArticle, getNextSlot } from './queue-article';

describe('queueArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    process.env.PUBLISH_HOURS_UTC = '9';
  });
  afterAll(async () => { await closeDb(); });

  it('schedules first article for the next 09:00 UTC slot', async () => {
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

  it('schedules second article exactly 24h after the latest scheduled (single hour config)', async () => {
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

// getNextSlot is exported so multi-hour configs can be exercised without
// trying to override the module-cached env() reader. Each case simulates a
// known DB state (the latest article's scheduledAt) and asserts the picked
// slot.
describe('getNextSlot', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
  });
  afterAll(async () => { await closeDb(); });

  it('with a single hour [9], next slot when no prior is the next 09:00 UTC after now+1h', async () => {
    // Pick a now whose +1h is still before today 09:00 — expect today 09:00.
    const now = new Date(Date.UTC(2099, 0, 10, 7, 30, 0));
    const slot = await getNextSlot([9], now);
    expect(slot.toISOString()).toBe('2099-01-10T09:00:00.000Z');
  });

  it('with [9,21], picks today 21:00 when prior is today 09:00', async () => {
    const existing = new Date(Date.UTC(2099, 0, 10, 9, 0, 0));
    await db().insert(articles).values({
      keyword: 'prior', category: 'exchanges', status: 'scheduled',
      slug: 'prior', scheduledAt: existing,
    });
    // now is irrelevant to this case because latest > now+1h.
    const now = new Date(Date.UTC(2099, 0, 10, 9, 30, 0));
    const slot = await getNextSlot([9, 21], now);
    expect(slot.toISOString()).toBe('2099-01-10T21:00:00.000Z');
  });

  it('with [9,21], picks tomorrow 09:00 when prior is today 21:00', async () => {
    const existing = new Date(Date.UTC(2099, 0, 10, 21, 0, 0));
    await db().insert(articles).values({
      keyword: 'prior', category: 'exchanges', status: 'scheduled',
      slug: 'prior', scheduledAt: existing,
    });
    const now = new Date(Date.UTC(2099, 0, 10, 22, 0, 0));
    const slot = await getNextSlot([9, 21], now);
    expect(slot.toISOString()).toBe('2099-01-11T09:00:00.000Z');
  });

  it('respects the now+1h floor when latest is far in the past', async () => {
    // Stale prior, e.g. older than now. Cursor should jump to now+1h.
    const stalePrior = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
    await db().insert(articles).values({
      keyword: 'prior', category: 'exchanges', status: 'scheduled',
      slug: 'prior', scheduledAt: stalePrior,
    });
    // now = 2099-01-10T07:30 → earliest = 08:30 → next [9] after 08:30 is 09:00 today.
    const now = new Date(Date.UTC(2099, 0, 10, 7, 30, 0));
    const slot = await getNextSlot([9], now);
    expect(slot.toISOString()).toBe('2099-01-10T09:00:00.000Z');
  });

  it('dedupes and sorts duplicate or out-of-order hour input', async () => {
    const now = new Date(Date.UTC(2099, 0, 10, 7, 30, 0));
    const slot = await getNextSlot([21, 9, 9], now);
    expect(slot.toISOString()).toBe('2099-01-10T09:00:00.000Z');
  });
});
