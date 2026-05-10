// src/config/categories.ts
export const CATEGORIES = [
  'exchanges', 'patterns', 'indicators', 'concepts', 'strategies',
  'automation', 'risk', 'coins', 'education', 'analysis',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_IMAGE_QUERY: Record<Category, string> = {
  exchanges:  'cryptocurrency trading platform interface',
  patterns:   'stock market chart pattern analysis',
  indicators: 'financial chart technical indicators',
  concepts:   'cryptocurrency futures trading',
  strategies: 'crypto trading strategy',
  automation: 'automated trading algorithm',
  risk:       'financial risk management trading',
  coins:      'cryptocurrency bitcoin ethereum',
  education:  'crypto trading learning',
  analysis:   'financial market analysis data',
};

export const WEEKLY_ROTATION_COUNTS: Record<Category, number> = {
  exchanges: 3, patterns: 3, indicators: 2, concepts: 3, strategies: 3,
  automation: 2, risk: 2, coins: 3, education: 2, analysis: 2,
};

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

export const CATEGORY_IMAGE_QUERY_WIDE: Record<Category, string> = {
  exchanges:  'crypto exchange screen',
  patterns:   'candlestick chart',
  indicators: 'trading chart screen',
  concepts:   'cryptocurrency market',
  strategies: 'trading desk',
  automation: 'computer code screen',
  risk:       'financial market data',
  coins:      'bitcoin coin',
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
// Wikimedia has clean technical diagrams (great for patterns/indicators);
// Unsplash has the highest-quality finance editorial photos with the cleanest
// commercial license (great for generic-stock categories like strategies/
// risk/concepts). Pixabay/Pexels are kept as backstops, not primary sources.
//
// `local-press-kit` is a local-disk source that returns hand-curated, brand-
// licensed press-kit images from storage/exchange-assets/<exchange>/. It only
// matches when the inline-image query mentions a known exchange slug.
// ─────────────────────────────────────────────────────────────────

export const INLINE_SOURCES = [
  'local-press-kit', 'wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik',
] as const;

export type InlineSource = typeof INLINE_SOURCES[number];

export const CATEGORY_INLINE_SOURCES: Record<Category, readonly InlineSource[]> = {
  // Exchange reviews need brand-licensed UI screenshots first; press-kit is
  // the only legal source for those. Then fall back to Wikimedia exchange
  // logos / generic trading photos from Unsplash.
  exchanges:  ['local-press-kit', 'wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik'],

  // Coin-specific articles want PD/CC coin logos — Wikimedia has clean
  // entries for BTC, ETH, etc. Then generic crypto stock from Unsplash.
  coins:      ['wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik'],

  // Technical-diagram heavy: doji, head-and-shoulders, RSI, MACD diagrams
  // exist on Wikimedia as clean SVG/raster CC-licensed assets.
  patterns:   ['wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik'],
  indicators: ['wikimedia', 'unsplash', 'pexels', 'pixabay', 'freepik'],

  // Generic-stock categories: Unsplash leads on quality + clean license.
  concepts:   ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
  strategies: ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
  risk:       ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
  education:  ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
  automation: ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
  analysis:   ['unsplash', 'pexels', 'pixabay', 'wikimedia', 'freepik'],
};

// Default ordering preserved from pre-routing behavior, used when
// fetchInlineCandidates is called without a category (e.g. legacy callers
// or unit tests that don't care about ordering).
export const DEFAULT_INLINE_SOURCES: readonly InlineSource[] = [
  'freepik', 'wikimedia', 'pixabay', 'pexels', 'unsplash',
];
