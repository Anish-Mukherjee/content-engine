// src/stages/harvest-keywords.ts
import { and, eq, inArray, sql } from 'drizzle-orm';

import { BRAND } from '../config/brand';
import { isCategory, type Category } from '../config/categories';
import { FILTERS } from '../config/filters';
import { db } from '../db/client';
import { articles, dataforseoTasks, keywordResults, seedKeywords } from '../db/schema';
import { checkRelevance } from '../integrations/claude';
import { fetchTaskResult } from '../integrations/dataforseo';
import { logger } from '../lib/logger';

const RELEVANCE_BATCH_SIZE = 20;
const ACTIVE_ARTICLE_STATUSES = [
  'pending', 'researching', 'researched', 'outlining', 'outlined',
  'writing', 'written', 'fetching_image', 'image_ready', 'scheduled',
  'research_failed', 'outline_failed', 'write_failed', 'image_failed', 'queue_failed',
] as const;

export async function harvestKeywords(): Promise<void> {
  const pending = await db()
    .select({
      id: dataforseoTasks.id,
      externalTaskId: dataforseoTasks.externalTaskId,
      seedKeywordId: dataforseoTasks.seedKeywordId,
      category: seedKeywords.category,
    })
    .from(dataforseoTasks)
    .innerJoin(seedKeywords, eq(seedKeywords.id, dataforseoTasks.seedKeywordId))
    .where(eq(dataforseoTasks.status, 'pending'));

  if (pending.length === 0) return;

  for (const task of pending) {
    try {
      await harvestOne(task);
    } catch (err) {
      logger.error({ err, taskId: task.externalTaskId }, 'harvest failed for task');
      await db().update(dataforseoTasks)
        .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
        .where(eq(dataforseoTasks.id, task.id));
    }
  }
}

type PendingTask = {
  id: string;
  externalTaskId: string;
  seedKeywordId: string;
  category: string;
};

async function harvestOne(task: PendingTask) {
  const result = await fetchTaskResult(task.externalTaskId);
  if (!result.complete) return;

  const category: Category = isCategory(task.category) ? task.category : 'concepts';

  // Insert raw results as pending_filter
  const insertedIds: string[] = [];
  for (const r of result.results ?? []) {
    const [row] = await db().insert(keywordResults).values({
      keyword: r.keyword,
      category,
      seedKeywordId: task.seedKeywordId,
      dataforseoTaskId: task.id,
      searchVolume: r.searchVolume,
      competition: r.competition,
      cpc: r.cpc,
      keywordDifficulty: r.keywordDifficulty,
      trend: r.trend,
      status: 'pending_filter',
    }).returning();
    insertedIds.push(row.id);
  }

  await db().update(dataforseoTasks)
    .set({ status: 'complete', retrievedAt: new Date(), resultCount: insertedIds.length })
    .where(eq(dataforseoTasks.id, task.id));

  if (insertedIds.length === 0) return;

  // Pass 1 — volume, competition, length
  await applyPass1Filters(insertedIds);

  // Pass 2 — duplicates
  await applyPass2Filters(insertedIds);

  // Pass 3 — Claude relevance
  await applyPass3Filters(insertedIds);
}

async function applyPass1Filters(ids: string[]) {
  await db().update(keywordResults)
    .set({ status: 'filtered_low_volume', processedAt: new Date(), filterReason: 'search_volume<100' })
    .where(and(
      inArray(keywordResults.id, ids),
      sql`${keywordResults.searchVolume} < ${FILTERS.min_search_volume}`,
      eq(keywordResults.status, 'pending_filter'),
    ));
  await db().update(keywordResults)
    .set({ status: 'filtered_high_competition', processedAt: new Date(), filterReason: 'competition>0.8' })
    .where(and(
      inArray(keywordResults.id, ids),
      sql`${keywordResults.competition} > ${FILTERS.max_competition}`,
      eq(keywordResults.status, 'pending_filter'),
    ));
  await db().update(keywordResults)
    .set({ status: 'filtered_too_short', processedAt: new Date(), filterReason: 'keyword_length<3' })
    .where(and(
      inArray(keywordResults.id, ids),
      sql`array_length(string_to_array(${keywordResults.keyword}, ' '), 1) < ${FILTERS.min_keyword_length}`,
      eq(keywordResults.status, 'pending_filter'),
    ));
}

async function applyPass2Filters(ids: string[]) {
  // Duplicate against published articles
  await db().execute(sql`
    UPDATE keyword_results kr SET status='duplicate_published', processed_at=NOW(),
      filter_reason='already in articles as published'
    WHERE kr.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      AND kr.status='pending_filter'
      AND EXISTS (SELECT 1 FROM articles a WHERE a.keyword=kr.keyword AND a.status='published')
  `);
  // Duplicate against queued (any active status)
  await db().execute(sql`
    UPDATE keyword_results kr SET status='duplicate_queued', processed_at=NOW(),
      filter_reason='already in articles as in-flight'
    WHERE kr.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      AND kr.status='pending_filter'
      AND EXISTS (SELECT 1 FROM articles a WHERE a.keyword=kr.keyword
                   AND a.status IN (${sql.join(ACTIVE_ARTICLE_STATUSES.map((s) => sql`${s}`), sql`, `)}))
  `);
  // Duplicate against other keyword_results already approved
  await db().execute(sql`
    UPDATE keyword_results kr SET status='duplicate_keyword', processed_at=NOW(),
      filter_reason='already in keyword_results as approved'
    WHERE kr.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      AND kr.status='pending_filter'
      AND EXISTS (SELECT 1 FROM keyword_results kr2
                   WHERE kr2.keyword=kr.keyword AND kr2.id<>kr.id AND kr2.status='approved')
  `);
}

async function applyPass3Filters(ids: string[]) {
  const candidates = await db()
    .select({ id: keywordResults.id, keyword: keywordResults.keyword, category: keywordResults.category })
    .from(keywordResults)
    .where(and(
      inArray(keywordResults.id, ids),
      eq(keywordResults.status, 'pending_filter'),
    ));

  for (let i = 0; i < candidates.length; i += RELEVANCE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + RELEVANCE_BATCH_SIZE);
    const verdicts = await checkRelevance(batch.map((c) => c.keyword), BRAND);
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      if (verdicts[j]) {
        await db().update(keywordResults)
          .set({ status: 'approved', processedAt: new Date() })
          .where(eq(keywordResults.id, c.id));
        await db().insert(articles).values({
          keywordResultId: c.id,
          keyword: c.keyword,
          category: c.category,
          status: 'pending',
        });
      } else {
        await db().update(keywordResults)
          .set({ status: 'filtered_irrelevant', processedAt: new Date(), filterReason: 'claude NO' })
          .where(eq(keywordResults.id, c.id));
      }
    }
  }
}
