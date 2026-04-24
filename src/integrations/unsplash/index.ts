// src/integrations/unsplash/index.ts
import type { Category } from '../../config/categories';
import { CATEGORY_IMAGE_QUERY } from '../../config/categories';
import { downloadAndSave } from '../inline-images/download';
import { search } from './client';
import type { LocalImage, UnsplashPhoto } from './types';

const HERO_WIDTH = 1200;
const HERO_HEIGHT = 630;

export async function searchHeroImage(category: Category): Promise<UnsplashPhoto | null> {
  const query = CATEGORY_IMAGE_QUERY[category];
  const resp = await search(query) as {
    results?: Array<{
      id: string;
      alt_description?: string | null;
      urls: { raw: string };
      user: { name: string; links: { html: string } };
      width: number;
      height: number;
    }>;
  };
  const top = resp.results?.[0];
  if (!top) return null;
  return {
    id: top.id,
    urlRaw: top.urls.raw,
    altText: top.alt_description ?? '',
    photographerName: top.user.name,
    photographerUrl: top.user.links.html,
    width: top.width,
    height: top.height,
  };
}

export async function downloadAndCrop(photo: UnsplashPhoto, slug: string): Promise<LocalImage> {
  // Unsplash serves dynamic crops via raw URL params — request a 2000px wide
  // master and let sharp re-crop locally. This avoids depending on Unsplash's
  // crop heuristics for rectangle fit.
  const target = new URL(photo.urlRaw);
  target.searchParams.set('w', '2000');
  target.searchParams.set('q', '80');
  const saved = await downloadAndSave(target.toString(), `${slug}-hero`, HERO_WIDTH, HERO_HEIGHT);

  return {
    url: saved.url,
    altText: photo.altText || slug,
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    unsplashId: photo.id,
    isFallback: false,
  };
}

export function getFallbackImage(category: Category): LocalImage {
  return {
    url: `/images/fallbacks/${category}.jpg`,
    altText: `${category} crypto futures`,
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    photographerName: null,
    photographerUrl: null,
    unsplashId: null,
    isFallback: true,
  };
}
