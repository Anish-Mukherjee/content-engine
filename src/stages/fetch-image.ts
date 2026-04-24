// src/stages/fetch-image.ts
import { eq } from 'drizzle-orm';

import { isCategory, type Category } from '../config/categories';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { resolvePlaceholder } from '../integrations/inline-images';
import { downloadAndCrop, getFallbackImage, searchHeroImage } from '../integrations/unsplash';
import type { LocalImage } from '../integrations/unsplash/types';
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

  const hero = await fetchHero(articleId, article.slug, category);
  const processedHtml = await processInlinePlaceholders(article.articleHtml ?? '', article.slug);

  await db().update(articles).set({
    status: 'image_ready',
    heroImage: hero,
    articleHtml: processedHtml,
    imageFetchedAt: new Date(),
  }).where(eq(articles.id, articleId));
}

async function fetchHero(articleId: string, slug: string, category: Category): Promise<LocalImage> {
  try {
    const photo = await searchHeroImage(category);
    if (photo) return await downloadAndCrop(photo, slug);
    return getFallbackImage(category);
  } catch (err) {
    logger.warn({ err, articleId }, 'hero image fetch failed; using category fallback');
    return getFallbackImage(category);
  }
}

async function processInlinePlaceholders(articleHtml: string, slug: string): Promise<string> {
  if (!articleHtml) return articleHtml;

  const placeholders = findInlineImagePlaceholders(articleHtml);
  if (placeholders.length === 0) return articleHtml;

  let html = articleHtml;
  for (let i = 0; i < placeholders.length; i++) {
    const placeholder = placeholders[i];
    const filenameStem = `${slug}-inline-${i + 1}`;
    try {
      const resolved = await resolvePlaceholder(placeholder.query, placeholder.caption, filenameStem);
      if (!resolved) {
        // Both Google and Wikimedia returned nothing. Strip the placeholder
        // so it doesn't render as an empty div on the page.
        html = replacePlaceholder(html, placeholder, '');
        logger.info({ query: placeholder.query }, 'no inline image source found; placeholder removed');
        continue;
      }
      html = replacePlaceholder(html, placeholder, resolved.figureHtml);
    } catch (err) {
      // Per the spec: image failures must never block the pipeline. Remove
      // the placeholder and keep going.
      logger.warn({ err, query: placeholder.query }, 'inline image resolve failed; placeholder removed');
      html = replacePlaceholder(html, placeholder, '');
    }
  }

  // Re-sanitize so the newly inlined <figure>/<img>/<figcaption> tags pass
  // through the allowlist (they're already generated from trusted data,
  // but this keeps a single source of truth for what article HTML looks like).
  return sanitizeArticleHtml(html);
}
