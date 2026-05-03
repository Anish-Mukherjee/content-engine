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

  // Round-robin across categories. Pick the category whose most recent published
  // article is oldest (NULLS first → never-published categories win), then the
  // oldest pending row within that category. Without this, a single huge harvest
  // batch in one category dominates the queue for weeks under strict FIFO.
  const [pending] = await db().execute<typeof articles.$inferSelect>(sql`
    SELECT a.*
    FROM articles a
    LEFT JOIN (
      SELECT category, MAX(published_at) AS last_published
      FROM articles
      WHERE status = 'published'
      GROUP BY category
    ) cl ON cl.category = a.category
    WHERE a.status = 'pending'
    ORDER BY cl.last_published ASC NULLS FIRST, a.created_at ASC
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
