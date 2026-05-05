// src/integrations/pixabay/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { searchImages, type PixabayHit } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

export type PixabayCandidate = {
  sourceId: string;
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<PixabayCandidate[]> {
  const hits = await searchImages(query);
  const out: PixabayCandidate[] = [];
  for (const hit of hits) {
    if (hit.imageWidth < MIN_WIDTH || hit.imageHeight < MIN_HEIGHT) continue;
    out.push({
      sourceId: String(hit.id),
      inlineSource: toInlineImageSource(hit, query),
    });
  }
  return out;
}

function toInlineImageSource(hit: PixabayHit, query: string): InlineImageSource {
  return {
    url: hit.largeImageURL,
    sourceName: 'Pixabay',
    sourceUrl: hit.pageURL,
    altText: hit.tags.trim() || query,
    width: hit.imageWidth,
    height: hit.imageHeight,
    license: 'Pixabay Content License',
    attribution: null,
    requiresAttribution: false,
  };
}

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const cands = await findInlineCandidates(query);
  return cands[0]?.inlineSource ?? null;
}
