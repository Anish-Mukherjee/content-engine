// src/stages/discover-keywords.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { seedKeywords, dataforseoTasks } from '../db/schema';
import { discoverKeywords } from './discover-keywords';
import { seedXgSite } from '../test/seed-xg';

vi.mock('../integrations/dataforseo', () => ({
  submitKeywordTask: vi.fn(),
}));
import { submitKeywordTask } from '../integrations/dataforseo';

let xgSiteId: string;

describe('discoverKeywords', () => {
  beforeAll(async () => { ({ siteId: xgSiteId } = await seedXgSite()); });
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
        await db().insert(seedKeywords).values({ keyword: `${cat}-${i}`, category: cat , siteId: xgSiteId});
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

  it('takes what is available when a category is under-seeded', async () => {
    // Only one "exchanges" seed, rotation asks for 3 — should warn and submit just 1 for that category
    await db().insert(seedKeywords).values({ keyword: 'only-one', category: 'exchanges' , siteId: xgSiteId});
    (submitKeywordTask as unknown as vi.Mock).mockImplementation(async (kw: string) =>
      ({ externalTaskId: `task-${kw}` }));

    await discoverKeywords();
    const tasks = await db().select().from(dataforseoTasks);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });
});
