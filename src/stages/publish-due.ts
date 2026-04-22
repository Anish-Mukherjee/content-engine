// src/stages/publish-due.ts
import { and, eq, lte } from 'drizzle-orm';

import { env } from '../config/env';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { revalidate } from '../integrations/frontend';
import { submitUrl } from '../integrations/google-indexing';
import { logger } from '../lib/logger';

export async function publishDue(): Promise<void> {
  const now = new Date();
  const due = await db()
    .select()
    .from(articles)
    .where(and(eq(articles.status, 'scheduled'), lte(articles.scheduledAt, now)));

  for (const article of due) {
    await db().update(articles)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(articles.id, article.id));

    const slug = article.slug ?? '';
    try {
      await revalidate([`/blog/${slug}`, '/blog', '/']);
    } catch (err) {
      logger.warn({ err, slug }, 'revalidate failed (soft-fail)');
    }

    try {
      const url = `${env().FRONTEND_BASE_URL}/blog/${slug}`;
      await submitUrl(url, 'URL_UPDATED');
    } catch (err) {
      logger.warn({ err, slug }, 'google indexing failed (soft-fail)');
    }
  }
}
