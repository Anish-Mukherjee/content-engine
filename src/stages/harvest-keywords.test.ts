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

  it('skips tasks still in progress', async () => {
    await seedPendingTask();
    (fetchTaskResult as unknown as vi.Mock).mockResolvedValueOnce({ complete: false });
    await harvestKeywords();
    const [task] = await db().select().from(dataforseoTasks);
    expect(task.status).toBe('pending');
  });
});
