// src/stages/fetch-image.ts
import { eq } from 'drizzle-orm';

import { isCategory, type Category } from '../config/categories';
import { db } from '../db/client';
import { articles } from '../db/schema';
import { downloadAndCrop, getFallbackImage, searchHeroImage } from '../integrations/unsplash';
import type { LocalImage } from '../integrations/unsplash/types';
import { TerminalError } from '../lib/errors';
import { logger } from '../lib/logger';

export async function fetchImage(articleId: string): Promise<void> {
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article) throw new TerminalError(`article ${articleId} not found`);
  if (!article.slug) throw new TerminalError('slug missing; cannot store image');

  const category: Category = isCategory(article.category) ? article.category : 'concepts';

  await db().update(articles).set({ status: 'fetching_image' }).where(eq(articles.id, articleId));

  let hero: LocalImage;
  try {
    const photo = await searchHeroImage(category);
    if (photo) {
      hero = await downloadAndCrop(photo, article.slug);
    } else {
      hero = getFallbackImage(category);
    }
  } catch (err) {
    logger.warn({ err, articleId }, 'image fetch failed; using fallback');
    hero = getFallbackImage(category);
  }

  await db().update(articles).set({
    status: 'image_ready',
    heroImage: hero,
    imageFetchedAt: new Date(),
  }).where(eq(articles.id, articleId));
}
