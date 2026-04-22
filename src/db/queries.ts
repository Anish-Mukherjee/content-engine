// src/db/queries.ts
import { and, asc, eq, lt, sql } from 'drizzle-orm';

import { db } from './client';
import { articles } from './schema';

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

  const [pending] = await db()
    .select()
    .from(articles)
    .where(eq(articles.status, 'pending'))
    .orderBy(asc(articles.createdAt))
    .limit(1);
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
