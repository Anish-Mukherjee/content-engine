// src/stages/research-topic.ts
import { eq } from 'drizzle-orm';

import { BRAND } from '../config/brand';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { researchKeyword } from '../integrations/perplexity';
import { TerminalError } from '../lib/errors';

export async function researchTopic(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);

  await db().update(articles).set({ status: 'researching' }).where(eq(articles.id, articleId));

  const brief = await researchKeyword(article.keyword, BRAND);

  await db().update(articles).set({
    status: 'researched',
    perplexityBrief: brief,
    researchedAt: new Date(),
  }).where(eq(articles.id, articleId));
}
