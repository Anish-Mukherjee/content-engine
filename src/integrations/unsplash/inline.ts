// src/integrations/unsplash/inline.ts
//
// Inline-image variant of the Unsplash integration. The hero variant
// (./index) is category-driven and crops to 1200×630; this one is
// query-driven (writer-prompt placeholders) and yields candidates suitable
// for the orchestrator's dedup-aware selection chain.
import type { InlineImageSource } from '../inline-images/types';
import { search } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

type UnsplashSearchResult = {
  id: string;
  alt_description?: string | null;
  urls: { raw: string };
  user: { name: string; links: { html: string } };
  width: number;
  height: number;
};

export type UnsplashInlineCandidate = {
  sourceId: string;
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<UnsplashInlineCandidate[]> {
  const resp = (await search(query)) as { results?: UnsplashSearchResult[] };
  const out: UnsplashInlineCandidate[] = [];
  for (const r of resp.results ?? []) {
    if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) continue;
    out.push({
      sourceId: r.id,
      inlineSource: toInlineImageSource(r, query),
    });
  }
  return out;
}

function toInlineImageSource(r: UnsplashSearchResult, query: string): InlineImageSource {
  // Unsplash serves dynamic crops via raw URL params — request a 1200-wide
  // copy comfortably above our 800×450 cover-crop target. q=80 keeps the
  // download payload reasonable.
  const target = new URL(r.urls.raw);
  target.searchParams.set('w', '1200');
  target.searchParams.set('q', '80');
  return {
    url: target.toString(),
    sourceName: 'Unsplash',
    sourceUrl: r.user.links.html,
    altText: r.alt_description?.trim() || query,
    width: r.width,
    height: r.height,
    license: 'Unsplash License',
    attribution: null,
    requiresAttribution: false,
  };
}

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const cands = await findInlineCandidates(query);
  return cands[0]?.inlineSource ?? null;
}
