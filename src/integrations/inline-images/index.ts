// src/integrations/inline-images/index.ts
import { findInlineImage as findOpenverse } from '../openverse';
import { findInlineImage as findWikimedia } from '../wikimedia';
import { downloadAndSave } from './download';
import type { InlineImageSource } from './types';

const INLINE_WIDTH = 800;
const INLINE_HEIGHT = 450;

export type InlineImageResult = {
  figureHtml: string;
  source: InlineImageSource;
  localUrl: string;
};

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
  // but CC image libraries use strict AND matching and return zero for
  // queries longer than ~4 words. Try the full query first, then fall back
  // to the first 3 words — usually the subject noun phrase — before giving
  // up. This mirrors how Claude phrases placeholders ("{subject} {qualifiers}").
  const variants = buildQueryVariants(query);
  for (const variant of variants) {
    const openverse = await findOpenverse(variant);
    if (openverse) return openverse;
    const wikimedia = await findWikimedia(variant);
    if (wikimedia) return wikimedia;
  }
  return null;
}

function buildQueryVariants(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [query];
  return [query, words.slice(0, 3).join(' ')];
}

export async function resolvePlaceholder(
  query: string,
  caption: string,
  filenameStem: string,
): Promise<InlineImageResult | null> {
  const source = await fetchInlineSource(query);
  if (!source) return null;

  const saved = await downloadAndSave(source.url, filenameStem, INLINE_WIDTH, INLINE_HEIGHT);

  const attributionPrefix = source.attribution ? `${escText(source.attribution)} — ` : '';
  const figureHtml =
    `<figure class="article-image">` +
    `<img src="${escAttr(saved.url)}" alt="${escAttr(caption)}" ` +
    `width="${INLINE_WIDTH}" height="${INLINE_HEIGHT}" loading="lazy" />` +
    `<figcaption>${escText(caption)} — ${attributionPrefix}` +
    `<a href="${escAttr(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escText(source.sourceName)}</a> ` +
    `(${escText(source.license)})</figcaption>` +
    `</figure>`;

  return {
    figureHtml,
    source,
    localUrl: saved.url,
  };
}
