// scripts/dedupe-pending-articles.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

import { db, closeDb } from '../src/db/client';
import { articles } from '../src/db/schema';
import { buildDedupePlan, dedupeActive } from './dedupe-pending-articles';

async function truncate() {
  await db().execute(sql`TRUNCATE TABLE articles, keyword_results, dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
}

type Article = typeof articles.$inferSelect;

async function insertArticle(row: Partial<Article> & { keyword: string }): Promise<Article> {
  const [a] = await db().insert(articles).values({
    keyword: row.keyword,
    category: row.category ?? 'automation',
    status: row.status ?? 'pending',
    searchVolume: row.searchVolume ?? 100,
    createdAt: row.createdAt ?? new Date(),
    publishedAt: row.publishedAt,
    slug: row.slug,
  }).returning();
  return a;
}

describe('buildDedupePlan', () => {
  it('returns empty plan when no duplicates exist', () => {
    const candidates = [
      { id: '1', keyword: 'rsi crypto strategy', category: 'indicators', status: 'pending', searchVolume: 100, createdAt: new Date() } as Article,
      { id: '2', keyword: 'macd crypto strategy', category: 'indicators', status: 'pending', searchVolume: 100, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, []);
    expect(plan.cancel).toHaveLength(0);
    expect(plan.keep).toHaveLength(2);
  });

  it('clusters word-permutations and keeps the highest-search-volume row', () => {
    const candidates = [
      { id: '1', keyword: 'crypto trading bot', category: 'automation', status: 'pending', searchVolume: 500, createdAt: new Date() } as Article,
      { id: '2', keyword: 'trading bot crypto', category: 'automation', status: 'pending', searchVolume: 1500, createdAt: new Date() } as Article,
      { id: '3', keyword: 'best crypto trading bots', category: 'automation', status: 'pending', searchVolume: 800, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, []);
    expect(plan.keep).toHaveLength(1);
    expect(plan.keep[0].id).toBe('2'); // 1500 sv wins
    expect(plan.cancel.map((c) => c.id).sort()).toEqual(['1', '3']);
    expect(plan.cancel.every((c) => c.keptKeyword === 'trading bot crypto')).toBe(true);
    expect(plan.cancel.every((c) => c.reason === 'duplicate_signature: active_cluster')).toBe(true);
  });

  it('cancels candidates that collide with a published article', () => {
    const occupied = [
      { id: '99', keyword: 'crypto trading bot', category: 'automation', status: 'published' } as Article,
    ];
    const candidates = [
      { id: '1', keyword: 'trading bot crypto', category: 'automation', status: 'pending', searchVolume: 500, createdAt: new Date() } as Article,
      { id: '2', keyword: 'best ai crypto trading bot', category: 'automation', status: 'pending', searchVolume: 700, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, occupied);
    expect(plan.keep).toHaveLength(1); // ai sig is distinct from base sig
    expect(plan.cancel).toHaveLength(1);
    expect(plan.cancel[0].id).toBe('1');
    expect(plan.cancel[0].keptKeyword).toBe('crypto trading bot');
    expect(plan.cancel[0].reason).toBe('duplicate_signature: existing_article');
  });

  it('prefers most-progressed status over higher search-volume', () => {
    const candidates = [
      { id: 'pend', keyword: 'crypto trading bot', category: 'automation', status: 'pending', searchVolume: 5000, createdAt: new Date() } as Article,
      { id: 'sched', keyword: 'trading bot crypto', category: 'automation', status: 'scheduled', searchVolume: 100, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, []);
    expect(plan.keep[0].id).toBe('sched'); // scheduled beats pending despite low volume
    expect(plan.cancel[0].id).toBe('pend');
  });

  it('falls back to search-volume when statuses tie on progress', () => {
    const candidates = [
      { id: 'a', keyword: 'crypto trading bot', category: 'automation', status: 'pending', searchVolume: 500, createdAt: new Date() } as Article,
      { id: 'b', keyword: 'trading bot crypto', category: 'automation', status: 'pending', searchVolume: 1500, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, []);
    expect(plan.keep[0].id).toBe('b');
  });

  it('keeps oldest createdAt as final tiebreaker', () => {
    const older = new Date('2026-04-01T00:00:00Z');
    const newer = new Date('2026-04-25T00:00:00Z');
    const candidates = [
      { id: 'b', keyword: 'trading bot crypto', category: 'automation', status: 'pending', searchVolume: 500, createdAt: newer } as Article,
      { id: 'a', keyword: 'crypto trading bot', category: 'automation', status: 'pending', searchVolume: 500, createdAt: older } as Article,
    ];
    const plan = buildDedupePlan(candidates, []);
    expect(plan.keep[0].id).toBe('a');
  });

  it('cancels a scheduled article when its signature matches a published article', () => {
    const occupied = [
      { id: 'pub', keyword: 'ai bots for trading', category: 'automation', status: 'published' } as Article,
    ];
    const candidates = [
      { id: 'sched', keyword: 'ai trading bots', category: 'automation', status: 'scheduled', searchVolume: 1000, createdAt: new Date() } as Article,
    ];
    const plan = buildDedupePlan(candidates, occupied);
    expect(plan.keep).toHaveLength(0);
    expect(plan.cancel).toHaveLength(1);
    expect(plan.cancel[0].status).toBe('scheduled');
    expect(plan.cancel[0].keptKeyword).toBe('ai bots for trading');
  });
});

describe('dedupeActive (integration)', () => {
  beforeEach(async () => {
    await truncate();
  });

  afterAll(async () => { await closeDb(); });

  it('default scope=active scans pending + scheduled + researched + ...', async () => {
    await insertArticle({ keyword: 'ai bots for trading', status: 'published', slug: 'ai-bots-for-trading', publishedAt: new Date() });
    const sched = await insertArticle({ keyword: 'ai trading bots', status: 'scheduled' });
    const res = await insertArticle({ keyword: 'crypto candlestick patterns', status: 'researched' });
    await insertArticle({ keyword: 'cryptocurrency candlestick patterns', status: 'published', slug: 'cryptocurrency-candlestick-patterns', publishedAt: new Date() });
    const safe = await insertArticle({ keyword: 'macd crypto strategy', status: 'pending' });

    const plan = await dedupeActive({ apply: true });

    const cancelled = await db().select().from(articles).where(eq(articles.status, 'cancelled'));
    const cancelledIds = cancelled.map((c) => c.id).sort();
    expect(cancelledIds).toEqual([sched.id, res.id].sort());
    const stillActive = await db().select().from(articles).where(eq(articles.status, 'pending'));
    expect(stillActive.map((a) => a.keyword)).toEqual(['macd crypto strategy']);
  });

  it('scope=pending leaves scheduled/researched articles alone', async () => {
    await insertArticle({ keyword: 'ai bots for trading', status: 'published', slug: 'ai-bots-for-trading', publishedAt: new Date() });
    const sched = await insertArticle({ keyword: 'ai trading bots', status: 'scheduled' });
    const pendDup = await insertArticle({ keyword: 'trading bot ai', status: 'pending' });

    await dedupeActive({ apply: true, scope: 'pending' });

    const schedAfter = await db().select().from(articles).where(eq(articles.id, sched.id));
    expect(schedAfter[0].status).toBe('scheduled');
    const pendAfter = await db().select().from(articles).where(eq(articles.id, pendDup.id));
    expect(pendAfter[0].status).toBe('cancelled');
  });

  it('dry-run does not modify the database', async () => {
    await insertArticle({ keyword: 'crypto trading bot', searchVolume: 500 });
    await insertArticle({ keyword: 'trading bot crypto', searchVolume: 1500 });
    await insertArticle({ keyword: 'best crypto trading bot', searchVolume: 800 });
    const plan = await dedupeActive({ apply: false });
    expect(plan.cancel).toHaveLength(2);

    const allPending = await db().select().from(articles).where(eq(articles.status, 'pending'));
    expect(allPending).toHaveLength(3);
  });

  it('apply marks duplicate rows as cancelled with informative lastError', async () => {
    await insertArticle({ keyword: 'crypto trading bot', searchVolume: 500 });
    await insertArticle({ keyword: 'trading bot crypto', searchVolume: 1500 });
    await insertArticle({ keyword: 'best crypto trading bots', searchVolume: 800 });
    await insertArticle({ keyword: 'macd crypto strategy', searchVolume: 600 }); // distinct sig

    const plan = await dedupeActive({ apply: true });
    expect(plan.cancel).toHaveLength(2);
    expect(plan.keep).toHaveLength(2);

    const cancelled = await db().select().from(articles).where(eq(articles.status, 'cancelled'));
    expect(cancelled).toHaveLength(2);
    for (const c of cancelled) {
      expect(c.lastError).toMatch(/duplicate_signature/);
      expect(c.lastError).toMatch(/trading bot crypto/);
    }
    const stillPending = await db().select().from(articles).where(eq(articles.status, 'pending'));
    expect(stillPending.map((a) => a.keyword).sort()).toEqual(['macd crypto strategy', 'trading bot crypto']);
  });

  it('cancels active articles in topic clusters that have been published within cooldown', async () => {
    // Recent bot publish puts the bot cluster in cooldown.
    await insertArticle({ keyword: 'ai bots for trading', status: 'published', slug: 'ai-bots-for-trading', publishedAt: new Date() });
    // Distinct-signature bot articles — different sigs, same cluster. All must be cancelled.
    const botPending = await insertArticle({ keyword: 'best crypto trading bot for beginners', status: 'pending' });
    const botSched = await insertArticle({ keyword: 'crypto algo trading', status: 'scheduled' });
    // Non-bot article — must survive.
    const safe = await insertArticle({ keyword: 'crypto market structure', status: 'pending' });

    const plan = await dedupeActive({ apply: true });

    const cancelled = await db().select().from(articles).where(eq(articles.status, 'cancelled'));
    const cancelledIds = new Set(cancelled.map((c) => c.id));
    expect(cancelledIds.has(botPending.id)).toBe(true);
    expect(cancelledIds.has(botSched.id)).toBe(true);
    expect(cancelledIds.has(safe.id)).toBe(false);

    const reasons = new Set(cancelled.map((c) => c.lastError));
    expect([...reasons].some((r) => r?.includes('cluster_cooldown: bot'))).toBe(true);
    expect([...reasons].some((r) => r?.includes('ai bots for trading'))).toBe(true);
  });

  it('cluster cooldown does not fire for keywords with no cluster anchors', async () => {
    await insertArticle({ keyword: 'ai bots for trading', status: 'published', slug: 'ai-bots-for-trading', publishedAt: new Date() });
    const generic = await insertArticle({ keyword: 'crypto market analysis', status: 'pending' });
    await dedupeActive({ apply: true });
    const after = await db().select().from(articles).where(eq(articles.id, generic.id));
    expect(after[0].status).toBe('pending');
  });

  it('within active cluster, scheduled wins over pending sibling', async () => {
    const sched = await insertArticle({ keyword: 'crypto trading bot', status: 'scheduled' });
    const pend = await insertArticle({ keyword: 'trading bot crypto', status: 'pending' });

    await dedupeActive({ apply: true });

    const after = await db().select().from(articles);
    const schedAfter = after.find((a) => a.id === sched.id)!;
    const pendAfter = after.find((a) => a.id === pend.id)!;
    expect(schedAfter.status).toBe('scheduled');
    expect(pendAfter.status).toBe('cancelled');
    expect(pendAfter.lastError).toContain('crypto trading bot');
  });
});
