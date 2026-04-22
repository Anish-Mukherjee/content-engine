// src/stages/discover-keywords.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { seedKeywords, dataforseoTasks } from '../db/schema';
import { discoverKeywords } from './discover-keywords';

vi.mock('../integrations/dataforseo', () => ({
  submitKeywordTask: vi.fn(),
}));
import { submitKeywordTask } from '../integrations/dataforseo';

describe('discoverKeywords', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
    (submitKeywordTask as unknown as vi.Mock).mockReset();
  });

  afterAll(async () => { await closeDb(); });

  it('picks N seeds per category LRU, submits to DataForSEO, records task rows', async () => {
    // Seed a handful per category — enough to satisfy rotation counts
    const cats = ['exchanges', 'patterns', 'indicators', 'concepts', 'strategies',
                  'automation', 'risk', 'coins', 'education', 'analysis'];
    for (const cat of cats) {
      for (let i = 0; i < 3; i++) {
        await db().insert(seedKeywords).values({ keyword: `${cat}-${i}`, category: cat });
      }
    }
    (submitKeywordTask as unknown as vi.Mock).mockImplementation(async (kw: string) =>
      ({ externalTaskId: `task-${kw}` }));

    await discoverKeywords();

    const tasks = await db().select().from(dataforseoTasks);
    expect(tasks).toHaveLength(25);

    // Every submitted seed had lastUsedAt advanced
    const used = await db().select().from(seedKeywords)
      .where(sql`${seedKeywords.lastUsedAt} IS NOT NULL`);
    expect(used).toHaveLength(25);
  });

  it('returns early with warning when not enough seeds available in a category', async () => {
    // Only one "exchanges" seed, need 3
    await db().insert(seedKeywords).values({ keyword: 'only-one', category: 'exchanges' });
    await expect(discoverKeywords()).rejects.toThrow(/insufficient seeds/i);
  });
});
