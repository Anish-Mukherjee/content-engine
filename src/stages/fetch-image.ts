// src/stages/fetch-image.ts
import { eq } from 'drizzle-orm';

import { isCategory, type Category } from '../config/categories';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { pickUniqueHero, pickUniqueInline } from '../lib/image-fetch';
import { TerminalError } from '../lib/errors';
import {
  findInlineImagePlaceholders,
  replacePlaceholder,
  sanitizeArticleHtml,
} from '../lib/html';
import { logger } from '../lib/logger';

export async function fetchImage(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);
  if (!article.slug) throw new TerminalError('slug missing; cannot store image');

  const category: Category = isCategory(article.category) ? article.category : 'concepts';

  await db().update(articles).set({ status: 'fetching_image' }).where(eq(articles.id, articleId));

  const altText = article.title || article.slug;
  const hero = await pickUniqueHero({
    category, articleId, slug: article.slug, altText, filenameStem: `${article.slug}-hero`,
  });
  const processedHtml = await processInlinePlaceholders(article.articleHtml ?? '', article.slug, articleId);

  await db().update(articles).set({
    status: 'image_ready',
    heroImage: hero,
    articleHtml: processedHtml,
    imageFetchedAt: new Date(),
  }).where(eq(articles.id, articleId));
}

async function processInlinePlaceholders(
  articleHtml: string, slug: string, articleId: string,
): Promise<string> {
  if (!articleHtml) return articleHtml;

  const placeholders = findInlineImagePlaceholders(articleHtml);
  if (placeholders.length === 0) return articleHtml;

  let html = articleHtml;
  for (let i = 0; i < placeholders.length; i++) {
    const placeholder = placeholders[i];
    const filenameStem = `${slug}-inline-${i + 1}`;
    try {
      const resolved = await pickUniqueInline({
        query: placeholder.query, caption: placeholder.caption,
        articleId, position: i + 1, filenameStem,
      });
      if (!resolved) {
        html = replacePlaceholder(html, placeholder, '');
        logger.info({ query: placeholder.query }, 'no inline image source found; placeholder removed');
        continue;
      }
      html = replacePlaceholder(html, placeholder, resolved.figureHtml);
    } catch (err) {
      logger.warn({ err, query: placeholder.query }, 'inline image resolve failed; placeholder removed');
      html = replacePlaceholder(html, placeholder, '');
    }
  }

  // Re-sanitize so the newly inlined <figure>/<img>/<figcaption> tags pass
  // through the allowlist (they're already generated from trusted data,
  // but this keeps a single source of truth for what article HTML looks like).
  return sanitizeArticleHtml(html);
}
