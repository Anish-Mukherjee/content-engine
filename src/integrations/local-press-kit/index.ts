// src/integrations/local-press-kit/index.ts
//
// Local-disk image source for hand-curated, brand-licensed press-kit assets.
// Pulls images from storage/exchange-assets/<exchange>/*.{jpg,png,webp} when
// the inline-image query mentions a known exchange slug. Used as the priority
// source for the `exchanges` category — exchange UI screenshots and brand
// imagery are the one bucket no stock-photo API can serve legally.
//
// To add a new exchange:
//   1. Add its slug to EXCHANGE_SLUGS below.
//   2. Drop press-kit images (downloaded from the exchange's official brand
//      assets / press kit page) into storage/exchange-assets/<slug>/.
//
// Images are re-encoded by the same downloadAndSave path used for HTTP
// sources, so dimensions and content-hash dedup work identically.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import type { InlineImageSource } from '../inline-images/types';
import { storageDir } from '../../lib/paths';
import { logger } from '../../lib/logger';

// Slug must match the directory name under storage/exchange-assets/.
// Lowercase, no punctuation. Multi-word names are normalized via QUERY_ALIASES.
export const EXCHANGE_SLUGS = [
  'bybit', 'binance', 'okx', 'bitget', 'kucoin', 'blofin',
  'gateio', 'bitmex', 'kraken', 'mexc', 'cryptocom', 'deribit',
] as const;

// The article writer prompt may emit dotted/spaced exchange names ("Gate.io",
// "Crypto.com"); normalize to slug form before the word-boundary match.
const QUERY_ALIASES: Record<string, string> = {
  'gate.io': 'gateio',
  'gate io': 'gateio',
  'crypto.com': 'cryptocom',
  'crypto com': 'cryptocom',
};

const SUPPORTED_EXTS = /\.(jpe?g|png|webp)$/i;

export function detectExchangeSlug(text: string): string | null {
  let normalized = text.toLowerCase();
  for (const [from, to] of Object.entries(QUERY_ALIASES)) {
    normalized = normalized.split(from).join(to);
  }
  for (const slug of EXCHANGE_SLUGS) {
    const re = new RegExp(`\\b${slug}\\b`);
    if (re.test(normalized)) return slug;
  }
  return null;
}

function exchangeAssetsDir(): string {
  return path.join(storageDir(), 'exchange-assets');
}

export type LocalPressKitCandidate = {
  sourceId: string;
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<LocalPressKitCandidate[]> {
  const slug = detectExchangeSlug(query);
  if (!slug) return [];

  const dir = path.join(exchangeAssetsDir(), slug);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    // Directory absent (no press-kit assets dropped in yet for this
    // exchange) — silently fall through so the next source can fire.
    return [];
  }

  const out: LocalPressKitCandidate[] = [];
  for (const f of files) {
    if (!SUPPORTED_EXTS.test(f)) continue;
    const filePath = path.join(dir, f);
    try {
      const meta = await sharp(filePath).metadata();
      if (!meta.width || !meta.height) continue;
      out.push({
        sourceId: `${slug}/${f}`,
        inlineSource: {
          url: `file://${filePath}`,
          sourceName: `${capitalize(slug)} press kit`,
          sourceUrl: '',
          altText: query,
          width: meta.width,
          height: meta.height,
          license: 'Press kit / official brand asset',
          attribution: null,
          requiresAttribution: false,
        },
      });
    } catch (err) {
      logger.warn(
        { filePath, err: err instanceof Error ? err.message : String(err) },
        'press-kit asset unreadable; skipping',
      );
    }
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
