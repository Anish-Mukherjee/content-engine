// src/db/queries.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from './client';
import { articles } from './schema';
import { pickNextDrivable, getArticle, markFailed } from './queries';
import { isSourceIdUsed, isContentHashUsed, recordImageUsage, clearImageUsageForArticle } from './queries';
import { imageUsage } from './schema';

async function truncate() {
  await db().execute(sql`TRUNCATE TABLE articles, keyword_results, dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
}

describe('queries', () => {
  beforeEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('pickNextDrivable returns oldest pending when no failed', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'a', category: 'exchanges', status: 'pending',
    }).returning();
    const [b] = await db().insert(articles).values({
      keyword: 'b', category: 'exchanges', status: 'pending',
    }).returning();

    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(a.id);
  });

  it('pickNextDrivable prefers retryable failed over pending', async () => {
    const [pending] = await db().insert(articles).values({
      keyword: 'p', category: 'exchanges', status: 'pending',
    }).returning();
    const [failed] = await db().insert(articles).values({
      keyword: 'f', category: 'exchanges', status: 'write_failed', retryCount: 1,
    }).returning();

    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(failed.id);
  });

  it('pickNextDrivable skips failed with retryCount >= 3', async () => {
    await db().insert(articles).values({
      keyword: 'exhausted', category: 'exchanges', status: 'write_failed', retryCount: 3,
    });
    const picked = await pickNextDrivable();
    expect(picked).toBeUndefined();
  });

  it('pickNextDrivable rotates: prefers category with oldest last-published', async () => {
    // automation was published recently
    await db().insert(articles).values({
      keyword: 'old auto', category: 'automation', status: 'published',
      slug: 'old-auto', publishedAt: new Date('2026-04-30T03:00:00Z'),
    });
    // strategies was published a long time ago
    await db().insert(articles).values({
      keyword: 'old strat', category: 'strategies', status: 'published',
      slug: 'old-strat', publishedAt: new Date('2026-03-01T03:00:00Z'),
    });
    // Both have pending rows — automation row was created earlier (would win FIFO)
    const [autoPending] = await db().insert(articles).values({
      keyword: 'pending auto', category: 'automation', status: 'pending',
      createdAt: new Date('2026-04-23T13:25:53Z'),
    }).returning();
    const [stratPending] = await db().insert(articles).values({
      keyword: 'pending strat', category: 'strategies', status: 'pending',
      createdAt: new Date('2026-04-26T13:25:53Z'),
    }).returning();

    const picked = await pickNextDrivable();
    // strategies hasn't been published since 2026-03-01, automation was 2026-04-30
    // → pick strategies even though its pending is newer
    expect(picked?.id).toBe(stratPending.id);
  });

  it('pickNextDrivable prefers never-published category over recently-published', async () => {
    await db().insert(articles).values({
      keyword: 'old auto', category: 'automation', status: 'published',
      slug: 'old-auto', publishedAt: new Date('2026-04-30T03:00:00Z'),
    });
    const [autoPending] = await db().insert(articles).values({
      keyword: 'pending auto', category: 'automation', status: 'pending',
      createdAt: new Date('2026-04-01T00:00:00Z'),
    }).returning();
    const [riskPending] = await db().insert(articles).values({
      keyword: 'pending risk', category: 'risk', status: 'pending',
      createdAt: new Date('2026-04-26T00:00:00Z'),
    }).returning();

    const picked = await pickNextDrivable();
    // 'risk' has never been published → it wins regardless of created_at
    expect(picked?.id).toBe(riskPending.id);
  });

  it('pickNextDrivable falls back to oldest createdAt within the chosen category', async () => {
    // Only one category has pending rows
    const [first] = await db().insert(articles).values({
      keyword: 'first', category: 'automation', status: 'pending',
      createdAt: new Date('2026-04-23T13:00:00Z'),
    }).returning();
    await db().insert(articles).values({
      keyword: 'second', category: 'automation', status: 'pending',
      createdAt: new Date('2026-04-24T13:00:00Z'),
    });
    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(first.id);
  });

  it('pickNextDrivable skips clusters that have been published within cooldown window', async () => {
    // Recently-published bot article puts the bot cluster in cooldown.
    await db().insert(articles).values({
      keyword: 'ai bots for trading', category: 'automation', status: 'published',
      slug: 'ai-bots-for-trading',
      publishedAt: new Date(),
    });
    // Pending bot article (same cluster) — should be skipped.
    await db().insert(articles).values({
      keyword: 'best crypto trading bot for beginners', category: 'automation', status: 'pending',
      createdAt: new Date('2026-04-23T13:00:00Z'),
    });
    // Pending non-bot article — should win.
    const [winner] = await db().insert(articles).values({
      keyword: 'crypto market structure', category: 'analysis', status: 'pending',
      createdAt: new Date('2026-04-23T13:30:00Z'),
    }).returning();

    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(winner.id);
  });

  it('pickNextDrivable returns undefined when every candidate is in a cooldown cluster', async () => {
    await db().insert(articles).values({
      keyword: 'ai bots for trading', category: 'automation', status: 'published',
      slug: 'ai-bots-for-trading',
      publishedAt: new Date(),
    });
    await db().insert(articles).values({
      keyword: 'best crypto trading bot for beginners', category: 'automation', status: 'pending',
    });
    const picked = await pickNextDrivable();
    expect(picked).toBeUndefined();
  });

  it('pickNextDrivable picks bot pending again once the bot cluster cooldown has expired', async () => {
    // Bot was published 30 days ago — well outside the 14-day cooldown.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db().insert(articles).values({
      keyword: 'ai bots for trading', category: 'automation', status: 'published',
      slug: 'ai-bots-old', publishedAt: longAgo, createdAt: longAgo,
    });
    const [bot] = await db().insert(articles).values({
      keyword: 'best crypto trading bot for beginners', category: 'automation', status: 'pending',
    }).returning();
    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(bot.id);
  });

  it('pickNextDrivable rotates within a single tick: an in-flight row pushes its category back', async () => {
    // Two categories, both have NULL last-activity (never published, no in-flight).
    const [coinA] = await db().insert(articles).values({
      keyword: 'btc futures', category: 'coins', status: 'pending',
      createdAt: new Date('2026-04-23T13:00:00Z'),
    }).returning();
    await db().insert(articles).values({
      keyword: 'eth futures', category: 'coins', status: 'pending',
      createdAt: new Date('2026-04-23T13:01:00Z'),
    });
    const [eduA] = await db().insert(articles).values({
      keyword: 'how to trade', category: 'education', status: 'pending',
      createdAt: new Date('2026-04-23T13:30:00Z'),
    }).returning();

    // Pick 1: oldest createdAt across NULL-last-activity categories → coinA
    const pick1 = await pickNextDrivable();
    expect(pick1?.id).toBe(coinA.id);

    // Simulate driveArticle starting research — bumps coins category's last-activity.
    await db().update(articles).set({ status: 'researching' }).where(eq(articles.id, pick1!.id));

    // Pick 2: coins now has recent in-flight activity, education still NULL → education wins.
    const pick2 = await pickNextDrivable();
    expect(pick2?.id).toBe(eduA.id);
  });

  it('markFailed sets status, increments retryCount, records lastError', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'x', category: 'exchanges', status: 'writing',
    }).returning();
    await markFailed(a.id, 'write_failed', new Error('boom'));
    const after = await getArticle(a.id);
    expect(after?.status).toBe('write_failed');
    expect(after?.retryCount).toBe(1);
    expect(after?.lastError).toContain('boom');
  });
});

describe('image_usage helpers', () => {
  let articleId: string;
  beforeEach(async () => {
    await db().delete(imageUsage);
    await db().delete(articles);
    const [row] = await db().insert(articles).values({
      keyword: 'k', category: 'indicators', status: 'pending',
    }).returning({ id: articles.id });
    articleId = row.id;
  });

  it('isSourceIdUsed returns false for unknown ids', async () => {
    expect(await isSourceIdUsed('unsplash', 'photo-X')).toBe(false);
  });

  it('isSourceIdUsed returns true after recording', async () => {
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/x-hero.jpg', source: 'unsplash', sourceId: 'photo-X',
      contentHash: 'abc',
    });
    expect(await isSourceIdUsed('unsplash', 'photo-X')).toBe(true);
  });

  it('isSourceIdUsed scoped by source', async () => {
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/x.jpg', source: 'unsplash', sourceId: 'collide',
      contentHash: 'h1',
    });
    expect(await isSourceIdUsed('freepik', 'collide')).toBe(false);
  });

  it('isContentHashUsed returns true after recording', async () => {
    await recordImageUsage({
      articleId, role: 'inline', position: 1,
      url: '/images/x-inline-1.jpg', source: 'freepik', sourceId: '12345',
      contentHash: 'sha256-abc',
    });
    expect(await isContentHashUsed('sha256-abc')).toBe(true);
    expect(await isContentHashUsed('different')).toBe(false);
  });

  it('clearImageUsageForArticle removes only that articles rows', async () => {
    const [other] = await db().insert(articles).values({
      keyword: 'k2', category: 'indicators', status: 'pending',
    }).returning({ id: articles.id });
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/a-hero.jpg', source: 'unsplash', sourceId: 'A',
      contentHash: 'hA',
    });
    await recordImageUsage({
      articleId: other.id, role: 'hero', position: null,
      url: '/images/b-hero.jpg', source: 'unsplash', sourceId: 'B',
      contentHash: 'hB',
    });
    await clearImageUsageForArticle(articleId);
    expect(await isContentHashUsed('hA')).toBe(false);
    expect(await isContentHashUsed('hB')).toBe(true);
  });
});
