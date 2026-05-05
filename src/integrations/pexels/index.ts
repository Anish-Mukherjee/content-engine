// src/integrations/pexels/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { searchImages, type PexelsPhoto } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

export type PexelsCandidate = {
  sourceId: string;
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<PexelsCandidate[]> {
  const photos = await searchImages(query);
  const out: PexelsCandidate[] = [];
  for (const photo of photos) {
    if (photo.width < MIN_WIDTH || photo.height < MIN_HEIGHT) continue;
    out.push({
      sourceId: String(photo.id),
      inlineSource: toInlineImageSource(photo, query),
    });
  }
  return out;
}

function toInlineImageSource(photo: PexelsPhoto, query: string): InlineImageSource {
  return {
    url: photo.src.large2x,
    sourceName: 'Pexels',
    sourceUrl: photo.url,
    altText: photo.alt || query,
    width: photo.width,
    height: photo.height,
    license: 'Pexels License',
    attribution: null,
    requiresAttribution: false,
  };
}

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const cands = await findInlineCandidates(query);
  return cands[0]?.inlineSource ?? null;
}
