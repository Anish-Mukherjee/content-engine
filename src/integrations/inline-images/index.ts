// src/integrations/inline-images/index.ts
import {
  type Category,
  type InlineSource,
  CATEGORY_INLINE_SOURCES,
  DEFAULT_INLINE_SOURCES,
} from '../../config/categories';
import { logger } from '../../lib/logger';
import { findInlineImage as findFreepik } from '../freepik';
import { findInlineImage as findWikimedia } from '../wikimedia';
import { findInlineCandidates as findFreepikCandidates } from '../freepik';
import { findInlineCandidates as findWikimediaCandidates } from '../wikimedia';
import { findInlineCandidates as findPixabayCandidates } from '../pixabay';
import { findInlineCandidates as findPexelsCandidates } from '../pexels';
import { findInlineCandidates as findUnsplashInlineCandidates } from '../unsplash/inline';
import { findInlineCandidates as findLocalPressKitCandidates } from '../local-press-kit';
import { downloadAndSave } from './download';
import type { InlineImageSource, InlineImageCandidate } from './types';

const INLINE_WIDTH = 800;
const INLINE_HEIGHT = 450;

export type InlineImageResult = {
  figureHtml: string;
  source: InlineImageSource;
  localUrl: string;
};

export type RenderInlineFigureArgs = {
  localUrl: string;
  caption: string;
  source: InlineImageSource;
};

export function renderInlineFigure(args: RenderInlineFigureArgs): string {
  const { localUrl, caption, source } = args;
  const authorPrefix = source.attribution ? `${escText(source.attribution)} — ` : '';
  const attributionHtml = source.requiresAttribution
    ? ` — ${authorPrefix}` +
      `<a href="${escAttr(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escText(source.sourceName)}</a> ` +
      `(${escText(source.license)})`
    : '';
  return (
    `<figure class="article-image">` +
    `<img src="${escAttr(localUrl)}" alt="${escAttr(caption)}" ` +
    `width="${INLINE_WIDTH}" height="${INLINE_HEIGHT}" loading="lazy" />` +
    `<figcaption>${escText(caption)}${attributionHtml}</figcaption>` +
    `</figure>`
  );
}

// HTML-escape for values we interpolate into attribute strings (caption, alt).
// Keep it small and specific — sanitize-html handles anything the LLM emits
// as free text elsewhere, but these attributes bypass the sanitizer.
function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function fetchInlineSource(query: string): Promise<InlineImageSource | null> {
  // The article writer prompt asks Claude for "very specific descriptive"
  // queries (e.g. "Bybit futures perpetual contract trading interface"),
  // but stock libraries use strict AND matching and return zero for queries
  // longer than ~4 words. Try the full query first, then fall back to the
  // first 3 words — usually the subject noun phrase — before giving up.
  // This mirrors how Claude phrases placeholders ("{subject} {qualifiers}").
  const variants = buildQueryVariants(query);
  for (const variant of variants) {
    const freepik = await tryGet(findFreepik, 'freepik', variant);
    if (freepik) return freepik;
    const wikimedia = await tryGet(findWikimedia, 'wikimedia', variant);
    if (wikimedia) return wikimedia;
  }
  return null;
}

// Wrap each source call so a thrown error treats the source as a miss and
// lets the next source in the chain run. Without this, one flaky source
// short-circuits the whole fallback.
async function tryGet(
  fn: (q: string) => Promise<InlineImageSource | null>,
  sourceName: string,
  query: string,
): Promise<InlineImageSource | null> {
  try {
    return await fn(query);
  } catch (err) {
    logger.warn(
      { source: sourceName, query, err: err instanceof Error ? err.message : String(err) },
      'inline image source errored; falling through',
    );
    return null;
  }
}

function buildQueryVariants(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [query];
  return [query, words.slice(0, 3).join(' ')];
}

type CandidateFetcher = (q: string) => Promise<{ sourceId: string; inlineSource: InlineImageSource }[]>;

const SOURCE_FETCHERS: Record<InlineSource, CandidateFetcher> = {
  'local-press-kit': findLocalPressKitCandidates,
  freepik:           findFreepikCandidates,
  wikimedia:         findWikimediaCandidates,
  pixabay:           findPixabayCandidates,
  pexels:            findPexelsCandidates,
  unsplash:          findUnsplashInlineCandidates,
};

export async function fetchInlineCandidates(
  query: string,
  category?: Category,
): Promise<InlineImageCandidate[]> {
  const order = category ? CATEGORY_INLINE_SOURCES[category] : DEFAULT_INLINE_SOURCES;
  const variants = buildQueryVariants(query);
  const out: InlineImageCandidate[] = [];
  for (const variant of variants) {
    for (const sourceName of order) {
      const fetcher = SOURCE_FETCHERS[sourceName];
      const cands = await tryGetMany(fetcher, sourceName, variant);
      out.push(
        ...cands.map((c) => ({
          source: sourceName,
          sourceId: c.sourceId,
          inlineSource: c.inlineSource,
        })),
      );
    }
  }
  return out;
}

async function tryGetMany<T>(
  fn: (q: string) => Promise<T[]>,
  sourceName: string,
  query: string,
): Promise<T[]> {
  try {
    return await fn(query);
  } catch (err) {
    logger.warn(
      { source: sourceName, query, err: err instanceof Error ? err.message : String(err) },
      'inline image source errored; treating as empty',
    );
    return [];
  }
}

export async function resolvePlaceholder(
  query: string,
  caption: string,
  filenameStem: string,
): Promise<InlineImageResult | null> {
  const source = await fetchInlineSource(query);
  if (!source) return null;

  const saved = await downloadAndSave(source.url, filenameStem, INLINE_WIDTH, INLINE_HEIGHT);

  // Sources with requiresAttribution=false (e.g. paid Freepik API) get a clean
  // figcaption with just the caption — no author/source/license suffix. CC and
  // free-tier sources keep the full attribution chain.
  const figureHtml = renderInlineFigure({ localUrl: saved.url, caption, source });

  return {
    figureHtml,
    source,
    localUrl: saved.url,
  };
}
