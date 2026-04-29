// src/integrations/freepik/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { getDownloadUrl, searchImages, type FreepikResource } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

export type FreepikCandidate = {
  sourceId: string;
  freepik: FreepikResource;
  url: string;          // download url (signed, ~1h TTL)
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<FreepikCandidate[]> {
  const photos = await searchImages(query);
  const out: FreepikCandidate[] = [];
  for (const photo of photos) {
    if (!isUsable(photo)) continue;
    const downloadUrl = await getDownloadUrl(photo.id);
    out.push({
      sourceId: String(photo.id),
      freepik: photo,
      url: downloadUrl,
      inlineSource: toInlineImageSource(photo, downloadUrl),
    });
  }
  return out;
}

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const cands = await findInlineCandidates(query);
  return cands[0]?.inlineSource ?? null;
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
