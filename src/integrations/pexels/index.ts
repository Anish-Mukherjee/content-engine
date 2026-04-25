// src/integrations/pexels/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { searchImages, type PexelsPhoto } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const photos = await searchImages(query);
  if (photos.length === 0) return null;

  const usable = photos.filter(meetsMinimums);
  if (usable.length === 0) return null;

  return toInlineImageSource(usable[0]);
}

function meetsMinimums(photo: PexelsPhoto): boolean {
  if ((photo.width ?? 0) < MIN_WIDTH) return false;
  if ((photo.height ?? 0) < MIN_HEIGHT) return false;
  // sharp can rasterise jpeg/png/webp; Pexels only serves these formats,
  // so no filetype check is needed beyond the URL probe below as a guard.
  if (!/\.(jpe?g|png|webp)(?:$|\?)/i.test(photo.src.large)) return false;
  return true;
}

function toInlineImageSource(photo: PexelsPhoto): InlineImageSource {
  // Use the `large` variant (max 940x650) as the download URL — large enough
  // for the 800x450 cover-crop and dramatically smaller than the multi-MB
  // original. Sharp will resize-crop again in downloadAndSave.
  return {
    url: photo.src.large,
    sourceName: 'Pexels',
    sourceUrl: photo.url,
    altText: photo.alt || '',
    width: photo.width,
    height: photo.height,
    license: 'Pexels License',
    attribution: photo.photographer || null,
    requiresAttribution: true,
  };
}
