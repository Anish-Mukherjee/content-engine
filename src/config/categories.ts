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
