// src/stages/outline-article.ts
import { eq } from 'drizzle-orm';

import { BRAND } from '../config/brand';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { generateOutline } from '../integrations/claude';
import { TerminalError } from '../lib/errors';

export async function outlineArticle(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);
  if (!article.perplexityBrief) throw new TerminalError('brief missing; cannot outline');

  await db().update(articles).set({ status: 'outlining' }).where(eq(articles.id, articleId));

  const outline = await generateOutline(
    { id: article.id, keyword: article.keyword, searchVolume: article.searchVolume },
    article.perplexityBrief,
    BRAND,
  );

  await db().update(articles).set({
    status: 'outlined',
    outline,
    title: outline.title,
    slug: outline.slug,
    metaTitle: outline.meta_title,
    metaDescription: outline.meta_description,
    secondaryKeywords: outline.secondary_keywords,
    estimatedReadTime: outline.estimated_read_time,
    outlinedAt: new Date(),
  }).where(eq(articles.id, articleId));
}
