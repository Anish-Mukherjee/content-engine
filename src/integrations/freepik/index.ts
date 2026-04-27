// src/integrations/freepik/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { getDownloadUrl, searchImages, type FreepikResource } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const photos = await searchImages(query);
  if (photos.length === 0) return null;

  for (const photo of photos) {
    if (!isUsable(photo)) continue;
    // Resolve the medium-size download URL (1500px wide). Doing this lazily —
    // only for the first usable candidate — keeps the per-image cost at one
    // search call + one download call rather than N download calls upfront.
    const downloadUrl = await getDownloadUrl(photo.id);
    return toInlineImageSource(photo, downloadUrl);
  }
  return null;
}

function isUsable(photo: FreepikResource): boolean {
  if (photo.image?.type !== 'photo') return false;
  const dims = parseSize(photo.image.source?.size);
  if (!dims) return false;
  if (dims.width < MIN_WIDTH || dims.height < MIN_HEIGHT) return false;
  return true;
}

function parseSize(size: string | undefined): { width: number; height: number } | null {
  if (!size) return null;
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function toInlineImageSource(photo: FreepikResource, downloadUrl: string): InlineImageSource {
  const dims = parseSize(photo.image.source.size) ?? { width: 0, height: 0 };
  // Our paid Freepik API plan covers attribution-free use of freemium content
  // ("Premium, Premium+ and Pro users do not need to credit the author" per
  // freepik.com docs). Flag this so the inline-images figcaption skips the
  // author/source/license suffix. Wikimedia (CC BY-SA) still requires it.
  return {
    url: downloadUrl,
    sourceName: 'Freepik',
    sourceUrl: photo.url,
    altText: photo.title ?? '',
    width: dims.width,
    height: dims.height,
    license: 'Freepik License',
    attribution: null,
    requiresAttribution: false,
  };
}
