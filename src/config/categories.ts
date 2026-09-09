// src/config/categories.ts
//
// Meme-coin niche (since 2026-09). Seeds, DataForSEO rotation, hero/inline
// image routing and the public category filter all key off CATEGORIES.
// LEGACY_CATEGORIES are the retired crypto-futures/TA categories: nothing new
// is written under them, but ~76 published articles still carry them, so the
// read API keeps accepting them as a filter.
export const CATEGORIES = [
  'platforms', 'tools', 'kols', 'wallets', 'automation', 'concepts',
  'strategies', 'risk', 'chains', 'coins', 'education', 'analysis',
] as const;

export type Category = typeof CATEGORIES[number];

export const LEGACY_CATEGORIES = ['exchanges', 'patterns', 'indicators'] as const;
export type LegacyCategory = typeof LEGACY_CATEGORIES[number];

export const CATEGORY_IMAGE_QUERY: Record<Category, string> = {
  platforms:  'decentralized exchange crypto trading app',
  tools:      'crypto trading terminal dashboard screen',
  kols:       'crypto influencer social media phone',
  wallets:    'blockchain wallet on-chain data analytics',
  automation: 'automated trading bot code screen',
  concepts:   'cryptocurrency token blockchain concept',
  strategies: 'crypto trading strategy chart',
  risk:       'crypto scam risk warning security',
  chains:     'solana blockchain network',
  coins:      'meme coin dogecoin shiba',
  education:  'learning crypto trading laptop',
  analysis:   'crypto market analysis data chart',
};

export const WEEKLY_ROTATION_COUNTS: Record<Category, number> = {
  platforms: 3, tools: 3, kols: 3, wallets: 3, automation: 2, concepts: 2,
  strategies: 2, risk: 2, chains: 1, coins: 2, education: 1, analysis: 1,
};

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

export function isLegacyCategory(v: string): v is LegacyCategory {
  return (LEGACY_CATEGORIES as readonly string[]).includes(v);
}

export function isKnownCategory(v: string): v is Category | LegacyCategory {
  return isCategory(v) || isLegacyCategory(v);
}

export const CATEGORY_IMAGE_QUERY_WIDE: Record<Category, string> = {
  platforms:  'crypto app screen',
  tools:      'trading dashboard screen',
  kols:       'smartphone social media',
  wallets:    'blockchain data screen',
  automation: 'computer code screen',
  concepts:   'cryptocurrency coins',
  strategies: 'trading desk',
  risk:       'security warning',
  chains:     'network nodes abstract',
  coins:      'dogecoin coin',
  education:  'studying computer',
  analysis:   'data analytics screen',
};

// ─────────────────────────────────────────────────────────────────
// Inline image source routing — per-category priority order.
//
// Each category maps to an ordered list of sources tried for the article's
// inline images. The first source returning a non-duplicate candidate wins.
// Sources omitted from a list are NOT tried for that category.
//
// Why per-category: stock libraries vary wildly in finance-content quality.
// Unsplash has the highest-quality editorial photos with the cleanest
// commercial license; Wikimedia has PD/CC coin logos and chain diagrams.
// Pixabay/Pexels are kept as backstops, not primary sources.
//
// `local-press-kit` is a local-disk source that returns hand-curated, brand-
// licensed press-kit images from storage/exchange-assets/<exchange>/. It only
// matches when the inline-image query mentions a known exchange slug, so it is
// harmless (a no-op) for meme-coin platforms that have no press kit yet.
// ─────────────────────────────────────────────────────────────────

export const INLINE_SOURCES = [
  'local-press-kit', 'wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik',
] as const;

export type InlineSource = typeof INLINE_SOURCES[number];

const STOCK_FIRST: readonly InlineSource[] = ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'];
const LOGO_FIRST: readonly InlineSource[] = ['wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik'];

export const CATEGORY_INLINE_SOURCES: Record<Category, readonly InlineSource[]> = {
  // Product reviews: press-kit first in case a brand-licensed asset exists.
  platforms:  ['local-press-kit', ...LOGO_FIRST],
  tools:      ['local-press-kit', ...LOGO_FIRST],

  // Coin- and chain-specific articles want PD/CC logos (DOGE, SHIB, Solana).
  coins:      LOGO_FIRST,
  chains:     LOGO_FIRST,

  // Everything else reads best with editorial stock.
  kols:       STOCK_FIRST,
  wallets:    STOCK_FIRST,
  automation: STOCK_FIRST,
  concepts:   STOCK_FIRST,
  strategies: STOCK_FIRST,
  risk:       STOCK_FIRST,
  education:  STOCK_FIRST,
  analysis:   STOCK_FIRST,
};

// Default ordering preserved from pre-routing behavior, used when
// fetchInlineCandidates is called without a category (e.g. legacy callers
// or unit tests that don't care about ordering).
export const DEFAULT_INLINE_SOURCES: readonly InlineSource[] = [
  'freepik', 'wikimedia', 'pixabay', 'pexels', 'unsplash',
];
