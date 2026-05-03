// scripts/dedupe-pending-articles.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';

import { db, closeDb } from '../src/db/client';
import { articles } from '../src/db/schema';
import { buildDedupePlan, dedupePending } from './dedupe-pending-articles';

async function truncate() {
  await db().execute(sql`TRUNCATE TABLE articles, keyword_results, dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
}

type Pending = typeof articles.$inferSelect;

async function insertPending(rows: Array<{ keyword: string; category?: string; searchVolume?: number; createdAt?: Date }>): Promise<Pending[]> {
  const result: Pending[] = [];
  for (const r of rows) {
    const [a] = await db().insert(articles).values({
      keyword: r.keyword,
      category: r.category ?? 'automation',
      status: 'pending',
      searchVolume: r.searchVolume ?? 100,
      createdAt: r.createdAt ?? new Date(),
    }).returning();
    result.push(a);
  }
  return result;
}

describe('buildDedupePlan', () => {
  it('returns empty plan when no duplicates exist', () => {
    const pending = [
      { id: '1', keyword: 'rsi crypto strategy', category: 'indicators', searchVolume: 100, createdAt: new Date() } as Pending,
      { id: '2', keyword: 'macd crypto strategy', category: 'indicators', searchVolume: 100, createdAt: new Date() } as Pending,
    ];
    const plan = buildDedupePlan(pending, []);
    expect(plan.cancel).toHaveLength(0);
    expect(plan.keep).toHaveLength(2);
  });

  it('clusters word-permutations and keeps the highest-search-volume row', () => {
    const pending = [
      { id: '1', keyword: 'crypto trading bot', category: 'automation', searchVolume: 500, createdAt: new Date() } as Pending,
      { id: '2', keyword: 'trading bot crypto', category: 'automation', searchVolume: 1500, createdAt: new Date() } as Pending,
      { id: '3', keyword: 'best crypto trading bots', category: 'automation', searchVolume: 800, createdAt: new Date() } as Pending,
    ];
    const plan = buildDedupePlan(pending, []);
    expect(plan.keep).toHaveLength(1);
    expect(plan.keep[0].id).toBe('2'); // 1500 sv wins
    expect(plan.cancel.map((c) => c.id).sort()).toEqual(['1', '3']);
    expect(plan.cancel.every((c) => c.keptKeyword === 'trading bot crypto')).toBe(true);
    expect(plan.cancel.every((c) => c.reason === 'duplicate_signature: pending_cluster')).toBe(true);
  });

  it('cancels pending rows that collide with an occupied (published / in-flight) article', () => {
    const occupied = [
      { id: '99', keyword: 'crypto trading bot', category: 'automation' } as Pending,
    ];
    const pending = [
      { id: '1', keyword: 'trading bot crypto', category: 'automation', searchVolume: 500, createdAt: new Date() } as Pending,
      { id: '2', keyword: 'best ai crypto trading bot', category: 'automation', searchVolume: 700, createdAt: new Date() } as Pending,
    ];
    const plan = buildDedupePlan(pending, occupied);
    expect(plan.keep).toHaveLength(1); // ai sig is distinct from base sig
    expect(plan.cancel).toHaveLength(1);
    expect(plan.cancel[0].id).toBe('1');
    expect(plan.cancel[0].keptKeyword).toBe('crypto trading bot');
    expect(plan.cancel[0].reason).toBe('duplicate_signature: existing_article');
  });

  it('keeps oldest createdAt as tiebreaker when search_volume is tied', () => {
    const older = new Date('2026-04-01T00:00:00Z');
    const newer = new Date('2026-04-25T00:00:00Z');
    const pending = [
      { id: 'b', keyword: 'trading bot crypto', category: 'automation', searchVolume: 500, createdAt: newer } as Pending,
      { id: 'a', keyword: 'crypto trading bot', category: 'automation', searchVolume: 500, createdAt: older } as Pending,
    ];
    const plan = buildDedupePlan(pending, []);
    expect(plan.keep[0].id).toBe('a');
  });
});

describe('dedupePending (integration)', () => {
  beforeEach(async () => {
    await truncate();
  });

  afterAll(async () => { await closeDb(); });

  it('dry-run does not modify the database', async () => {
    await insertPending([
      { keyword: 'crypto trading bot', searchVolume: 500 },
      { keyword: 'trading bot crypto', searchVolume: 1500 },
      { keyword: 'best crypto trading bot', searchVolume: 800 },
    ]);
    const plan = await dedupePending({ apply: false });
    expect(plan.cancel).toHaveLength(2);

    const allPending = await db().select().from(articles).where(eq(articles.status, 'pending'));
    expect(allPending).toHaveLength(3);
  });

  it('apply marks duplicate rows as cancelled with informative lastError', async () => {
    const inserted = await insertPending([
      { keyword: 'crypto trading bot', searchVolume: 500 },
      { keyword: 'trading bot crypto', searchVolume: 1500 },
      { keyword: 'best crypto trading bots', searchVolume: 800 },
      { keyword: 'macd crypto strategy', searchVolume: 600 }, // different sig — keep
    ]);

    const plan = await dedupePending({ apply: true });
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
});
