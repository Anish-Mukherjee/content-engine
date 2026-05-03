// src/stages/harvest-keywords.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { seedKeywords, dataforseoTasks, keywordResults, articles } from '../db/schema';
import { harvestKeywords } from './harvest-keywords';

vi.mock('../integrations/dataforseo', () => ({ fetchTaskResult: vi.fn() }));
vi.mock('../integrations/claude', () => ({ checkRelevance: vi.fn() }));
import { fetchTaskResult } from '../integrations/dataforseo';
import { checkRelevance } from '../integrations/claude';

async function resetAll() {
  await db().execute(sql`TRUNCATE TABLE articles, keyword_results, dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
}

describe('harvestKeywords', () => {
  beforeEach(async () => {
    await resetAll();
    (fetchTaskResult as unknown as vi.Mock).mockReset();
    (checkRelevance as unknown as vi.Mock).mockReset();
  });

  afterAll(async () => { await closeDb(); });

  async function seedPendingTask() {
    const [seed] = await db().insert(seedKeywords).values({
      keyword: 'seed', category: 'exchanges',
    }).returning();
    const [task] = await db().insert(dataforseoTasks).values({
      externalTaskId: 'ext-1', seedKeywordId: seed.id, status: 'pending',
    }).returning();
    return { seed, task };
  }

  it('marks task complete and inserts results when DataForSEO returns', async () => {
    await seedPendingTask();
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'good one relevant', searchVolume: 500, competition: 0.3,
          cpc: 1, keywordDifficulty: 40, trend: 'growing' },
      ],
    });
    (checkRelevance as unknown as vi.Mock).mockResolvedValueOnce([true]);

    await harvestKeywords();

    const [taskRow] = await db().select().from(dataforseoTasks);
    expect(taskRow.status).toBe('complete');

    const approved = await db().select().from(keywordResults)
      .where(sql`${keywordResults.status} = 'approved'`);
    expect(approved).toHaveLength(1);

    const arts = await db().select().from(articles);
    expect(arts).toHaveLength(1);
    expect(arts[0].status).toBe('pending');
  });

  it('filters low volume and high competition', async () => {
    await seedPendingTask();
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'low volume kw', searchVolume: 50, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'high comp kw', searchVolume: 500, competition: 0.9, cpc: 1, keywordDifficulty: 80, trend: 'stable' },
        { keyword: 'short kw', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });

    await harvestKeywords();

    const rows = await db().select().from(keywordResults);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['filtered_high_competition', 'filtered_low_volume', 'filtered_too_short']);
    const arts = await db().select().from(articles);
    expect(arts).toHaveLength(0);
  });

  it('filters duplicates against existing articles', async () => {
    await seedPendingTask();
    // Prior article with same keyword, published
    await db().insert(articles).values({
      keyword: 'already published kw', category: 'exchanges', status: 'published',
      slug: 'already-published-kw',
    });
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'already published kw', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });
    (checkRelevance as unknown as vi.Mock).mockResolvedValueOnce([true]);

    await harvestKeywords();

    const [kr] = await db().select().from(keywordResults);
    expect(kr.status).toBe('duplicate_published');
  });

  it('filters word-permutation duplicates against published articles', async () => {
    await seedPendingTask();
    await db().insert(articles).values({
      keyword: 'crypto trading bot', category: 'exchanges', status: 'published',
      slug: 'crypto-trading-bot',
    });
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'trading bot crypto', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'best crypto trading bot', searchVolume: 600, competition: 0.4, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'cryptocurrency trading bot', searchVolume: 400, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });

    await harvestKeywords();

    const rows = await db().select().from(keywordResults);
    expect(rows.every((r) => r.status === 'duplicate_signature')).toBe(true);
    const arts = await db().select().from(articles).where(sql`${articles.status} = 'pending'`);
    expect(arts).toHaveLength(0);
  });

  it('within one batch keeps only one row per signature, drops the rest', async () => {
    await seedPendingTask();
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'crypto trading bot', searchVolume: 1000, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'trading bot crypto', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'best crypto trading bots', searchVolume: 800, competition: 0.4, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        { keyword: 'macd crypto strategy', searchVolume: 600, competition: 0.4, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });
    // Only the surviving rows (1 trading-bot + 1 macd) are sent to Claude
    (checkRelevance as unknown as vi.Mock).mockImplementation(async (kws: string[]) => kws.map(() => true));

    await harvestKeywords();

    const approved = await db().select().from(keywordResults).where(sql`${keywordResults.status} = 'approved'`);
    expect(approved).toHaveLength(2);
    const dupes = await db().select().from(keywordResults).where(sql`${keywordResults.status} = 'duplicate_signature'`);
    expect(dupes).toHaveLength(2);
    const arts = await db().select().from(articles);
    expect(arts).toHaveLength(2);
    const arstSigs = new Set(arts.map((a) => a.keyword));
    // first encounter wins, so "crypto trading bot" survives over its permutations
    expect(arstSigs.has('crypto trading bot')).toBe(true);
    expect(arstSigs.has('macd crypto strategy')).toBe(true);
  });

  it('filters new keywords whose topic cluster has a recent published article', async () => {
    await seedPendingTask();
    // Recently-published bot article puts the bot cluster in cooldown.
    await db().insert(articles).values({
      keyword: 'ai bots for trading', category: 'automation', status: 'published',
      slug: 'ai-bots-for-trading', publishedAt: new Date(),
    });
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        // Same cluster (bot), but distinct signature — must be cluster-filtered.
        { keyword: 'best crypto trading bot for beginners', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
        // Different cluster (rsi) — must pass through.
        { keyword: 'rsi divergence crypto', searchVolume: 600, competition: 0.4, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });
    (checkRelevance as unknown as vi.Mock).mockResolvedValueOnce([true]); // only one should reach Pass 3

    await harvestKeywords();

    const cluster = await db().select().from(keywordResults)
      .where(sql`${keywordResults.keyword} = 'best crypto trading bot for beginners'`);
    expect(cluster[0].status).toBe('cluster_saturated');

    const passed = await db().select().from(keywordResults)
      .where(sql`${keywordResults.keyword} = 'rsi divergence crypto'`);
    expect(passed[0].status).toBe('approved');
  });

  it('filters signature duplicates against already-approved keyword_results', async () => {
    const { task, seed } = await seedPendingTask();
    // Pre-existing approved kr (e.g. from a prior run) for "crypto trading bot"
    await db().insert(keywordResults).values({
      keyword: 'crypto trading bot',
      category: 'exchanges',
      seedKeywordId: seed.id,
      dataforseoTaskId: task.id,
      searchVolume: 1000,
      competition: 0.3,
      status: 'approved',
    });

    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({
      complete: true,
      results: [
        { keyword: 'trading bot crypto', searchVolume: 500, competition: 0.3, cpc: 1, keywordDifficulty: 40, trend: 'stable' },
      ],
    });

    await harvestKeywords();

    const newRows = await db().select().from(keywordResults)
      .where(sql`${keywordResults.keyword} = 'trading bot crypto'`);
    expect(newRows).toHaveLength(1);
    expect(newRows[0].status).toBe('duplicate_signature');
  });

  it('skips tasks still in progress', async () => {
    await seedPendingTask();
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({ complete: false });
    await harvestKeywords();
    const [task] = await db().select().from(dataforseoTasks);
    expect(task.status).toBe('pending');
  });
});
