// src/db/queries.ts
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import { CLUSTER_COOLDOWN_DAYS, clusterTags, intersects } from '../config/topic-clusters';
import { db } from './client';
import { articles, imageUsage } from './schema';

export async function getCooldownClusters(daysAgo: number = CLUSTER_COOLDOWN_DAYS): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const recent = await db()
    .select({ keyword: articles.keyword })
    .from(articles)
    .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, cutoff)));
  const result = new Set<string>();
  for (const r of recent) {
    for (const t of clusterTags(r.keyword)) result.add(t);
  }
  return result;
}

export async function pickNextDrivable(excludeIds: string[] = []) {
  const excludeSet = new Set(excludeIds);

  const retryables = await db()
    .select()
    .from(articles)
    .where(
      and(
        sql`${articles.status} IN ('research_failed','outline_failed','write_failed','image_failed','queue_failed')`,
        lt(articles.retryCount, 3),
      ),
    )
    .orderBy(asc(articles.updatedAt));
  for (const r of retryables) {
    if (!excludeSet.has(r.id)) return r;
  }

  // Round-robin across categories. Pick the category whose most recent activity
  // (= max of `published_at` for published rows OR `updated_at` for any in-flight
  // row) is oldest. NULLS first → never-touched categories win.
  //
  // Why both timestamps: this also rotates *within* a single driveDailyBatch
  // tick. driveArticle transitions a pending row to 'researching', bumping
  // updated_at. The next pick in the same tick sees that category as just-touched
  // and moves to a different one — so a 2-articles-per-day batch hits two
  // distinct categories instead of two from the same backlog cluster.
  //
  // Topic-cluster cooldown: candidates whose keyword is in a cluster that's
  // been published within CLUSTER_COOLDOWN_DAYS are skipped. This prevents
  // "another bot article" / "another rsi article" / "another bybit article"
  // from running back-to-back even when their signatures differ.
  const cooldown = await getCooldownClusters();

  const candidates = await db().execute<typeof articles.$inferSelect>(sql`
    SELECT a.*
    FROM articles a
    LEFT JOIN (
      SELECT
        category,
        GREATEST(
          MAX(published_at) FILTER (WHERE status = 'published'),
          MAX(updated_at) FILTER (WHERE status NOT IN ('pending', 'cancelled', 'published'))
        ) AS last_activity
      FROM articles
      GROUP BY category
    ) cl ON cl.category = a.category
    WHERE a.status = 'pending'
    ORDER BY cl.last_activity ASC NULLS FIRST, a.created_at ASC
  `);

  for (const c of candidates) {
    if (excludeSet.has(c.id)) continue;
    if (intersects(clusterTags(c.keyword), cooldown)) continue;
    return c;
  }
  return undefined;
}

export async function getArticle(id: string) {
  const [row] = await db().select().from(articles).where(eq(articles.id, id)).limit(1);
  return row;
}

export async function markFailed(id: string, failedStatus: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const isTerminal = err instanceof Error && err.name === 'TerminalError';
  await db()
    .update(articles)
    .set({
      status: failedStatus,
      lastError: message,
      retryCount: isTerminal ? 3 : sql`${articles.retryCount} + 1`,
    })
    .where(eq(articles.id, id));
}

export type RecordImageUsageInput = {
  articleId: string;
  role: 'hero' | 'inline';
  position: number | null;
  url: string;
  source: 'unsplash' | 'freepik' | 'wikimedia' | 'pixabay' | 'pexels' | 'legacy';
  sourceId: string | null;
  contentHash: string;
};

export async function recordImageUsage(input: RecordImageUsageInput): Promise<void> {
  await db().insert(imageUsage).values(input);
}

export async function isSourceIdUsed(source: string, sourceId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: imageUsage.id })
    .from(imageUsage)
    .where(and(eq(imageUsage.source, source), eq(imageUsage.sourceId, sourceId)))
    .limit(1);
  return !!row;
}

export async function isContentHashUsed(contentHash: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: imageUsage.id })
    .from(imageUsage)
    .where(eq(imageUsage.contentHash, contentHash))
    .limit(1);
  return !!row;
}

export async function clearImageUsageForArticle(articleId: string): Promise<void> {
  await db().delete(imageUsage).where(eq(imageUsage.articleId, articleId));
}
