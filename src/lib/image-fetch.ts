// src/lib/image-fetch.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Category } from '../config/categories';
import { isContentHashUsed, isSourceIdUsed, recordImageUsage } from '../db/queries';
import {
  downloadAndCrop, getFallbackImage, searchHeroCandidates,
} from '../integrations/unsplash';
import type { LocalImage, UnsplashPhoto } from '../integrations/unsplash/types';
import { logger } from './logger';
import { imagesDir } from './paths';

export type PickHeroArgs = {
  category: Category;
  articleId: string;
  slug: string;
  altText: string;
  filenameStem: string;
};

async function tryHeroCandidate(
  photo: UnsplashPhoto,
  args: PickHeroArgs,
): Promise<LocalImage | null> {
  if (await isSourceIdUsed('unsplash', photo.id)) return null;

  const local = await downloadAndCrop(photo, args.slug, args.altText, args.filenameStem);
  const hash = local.contentHash;
  if (!hash) {
    logger.warn(
      { unsplashId: photo.id, articleId: args.articleId },
      'hero image has no content hash; skipping dedup check (this should not happen)',
    );
    return local;
  }

  if (await isContentHashUsed(hash)) {
    try {
      await fs.unlink(path.join(imagesDir(), `${args.filenameStem}.jpg`));
    } catch (err) {
      logger.warn({ err }, 'failed to unlink duplicate hero file');
    }
    return null;
  }

  await recordImageUsage({
    articleId: args.articleId,
    role: 'hero', position: null,
    url: local.url,
    source: 'unsplash', sourceId: photo.id,
    contentHash: hash,
  });
  return local;
}

export async function pickUniqueHero(args: PickHeroArgs): Promise<LocalImage> {
  for (const wide of [false, true]) {
    const candidates = await searchHeroCandidates(args.category, wide ? { wide: true } : {});
    for (const photo of candidates) {
      const local = await tryHeroCandidate(photo, args);
      if (local) return local;
    }
  }
  return getFallbackImage(args.category, args.altText);
}
