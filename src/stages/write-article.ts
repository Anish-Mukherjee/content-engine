// src/stages/write-article.ts
import { eq } from 'drizzle-orm';

import { BRAND } from '../config/brand';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { writeArticleBody } from '../integrations/claude';
import type { ArticleOutline } from '../integrations/claude/types';
import type { PerplexityBrief } from '../integrations/perplexity/types';
import { TerminalError } from '../lib/errors';
import { countWords, extractFaqSchema, sanitizeArticleHtml, stripFaqSection } from '../lib/html';

const MIN_WORDS = 1000;

export async function writeArticle(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);
  if (!article.outline || !article.perplexityBrief) {
    throw new TerminalError('outline or brief missing; cannot write');
  }

  await db().update(articles).set({ status: 'writing' }).where(eq(articles.id, articleId));

  const raw = await writeArticleBody(
    { keyword: article.keyword, secondaryKeywords: article.secondaryKeywords as string[] | null },
    article.outline as unknown as ArticleOutline,
    article.perplexityBrief as unknown as PerplexityBrief,
    BRAND,
  );

  const sanitized = sanitizeArticleHtml(raw);
  const wordCount = countWords(sanitized);
  if (wordCount < MIN_WORDS) {
    throw new TerminalError(`article too short: ${wordCount} words (min ${MIN_WORDS})`);
  }
  const faqSchema = extractFaqSchema(sanitized);
  const articleHtml = stripFaqSection(sanitized);

  await db().update(articles).set({
    status: 'written',
    articleHtml,
    wordCount,
    faqSchema: faqSchema ?? null,
    writtenAt: new Date(),
  }).where(eq(articles.id, articleId));
}
