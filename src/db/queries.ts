// src/db/queries.ts
import { and, asc, eq, lt, sql } from 'drizzle-orm';

import { db } from './client';
import { articles, imageUsage } from './schema';

export async function pickNextDrivable() {
  const [retryable] = await db()
    .select()
    .from(articles)
    .where(
      and(
        sql`${articles.status} IN ('research_failed','outline_failed','write_failed','image_failed','queue_failed')`,
        lt(articles.retryCount, 3),
      ),
    )
    .orderBy(asc(articles.updatedAt))
    .limit(1);
  if (retryable) return retryable;

  // Round-robin across categories. Pick the category whose most recent activity
  // (= max of `published_at` for published rows OR `updated_at` for any in-flight
  // row) is oldest. NULLS first → never-touched categories win.
  //
  // Why both timestamps: this also rotates *within* a single driveDailyBatch
  // tick. driveArticle transitions a pending row to 'researching', bumping
  // updated_at. The next pick in the same tick sees that category as just-touched
  // and moves to a different one — so a 2-articles-per-day batch hits two
  // distinct categories instead of two from the same backlog cluster.
  const [pending] = await db().execute<typeof articles.$inferSelect>(sql`
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
    LIMIT 1
  `);
  return pending;
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
  source: 'unsplash' | 'freepik' | 'wikimedia' | 'legacy';
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
