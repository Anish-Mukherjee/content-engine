// src/stages/discover-keywords.ts
import { asc, eq, sql } from 'drizzle-orm';

import { CATEGORIES, WEEKLY_ROTATION_COUNTS } from '../config/categories';
import type { Category } from '../config/categories';
import { db } from '../db/client';
import { dataforseoTasks, seedKeywords } from '../db/schema';
import { submitKeywordTask } from '../integrations/dataforseo';
import { logger } from '../lib/logger';

export async function discoverKeywords(): Promise<void> {
  const selected: Array<{ id: string; keyword: string; category: Category }> = [];

  for (const category of CATEGORIES) {
    const need = WEEKLY_ROTATION_COUNTS[category];
    const rows = await db()
      .select()
      .from(seedKeywords)
      .where(eq(seedKeywords.category, category))
      .orderBy(asc(sql`COALESCE(${seedKeywords.lastUsedAt}, '1970-01-01'::timestamp)`), asc(seedKeywords.createdAt))
      .limit(need);
    if (rows.length < need) {
      throw new Error(
        `insufficient seeds in category "${category}": have ${rows.length}, need ${need}`,
      );
    }
    for (const r of rows) selected.push({ id: r.id, keyword: r.keyword, category });
  }

  logger.info({ count: selected.length }, 'submitting seeds to DataForSEO');

  for (const s of selected) {
    const { externalTaskId } = await submitKeywordTask(s.keyword);
    await db().insert(dataforseoTasks).values({
      externalTaskId,
      seedKeywordId: s.id,
      status: 'pending',
    });
    await db()
      .update(seedKeywords)
      .set({
        lastUsedAt: new Date(),
        timesUsed: sql`${seedKeywords.timesUsed} + 1`,
      })
      .where(eq(seedKeywords.id, s.id));
  }
}
