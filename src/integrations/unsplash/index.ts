// src/integrations/unsplash/index.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import type { Category } from '../../config/categories';
import { CATEGORY_IMAGE_QUERY } from '../../config/categories';
import { search, downloadBytes } from './client';
import type { LocalImage, UnsplashPhoto } from './types';

function storageDir(): string {
  return process.env.STORAGE_DIR ?? path.resolve('storage');
}

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
  const target = new URL(photo.urlRaw);
  target.searchParams.set('w', '2000');
  target.searchParams.set('q', '80');
  const buf = await downloadBytes(target.toString());
  const cropped = await sharp(Buffer.from(buf))
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const dir = path.join(storageDir(), 'images');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${slug}-hero.jpg`;
  await fs.writeFile(path.join(dir, filename), cropped);

  return {
    url: `/images/${filename}`,
    altText: photo.altText || slug,
    width: 1200,
    height: 630,
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
    width: 1200,
    height: 630,
    photographerName: null,
    photographerUrl: null,
    unsplashId: null,
    isFallback: true,
  };
}
