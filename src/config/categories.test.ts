// src/config/categories.test.ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, LEGACY_CATEGORIES, WEEKLY_ROTATION_COUNTS,
  CATEGORY_IMAGE_QUERY, CATEGORY_IMAGE_QUERY_WIDE, CATEGORY_INLINE_SOURCES,
  isCategory, isLegacyCategory, isKnownCategory,
} from './categories';
import seeds from './seed-keywords.json' with { type: 'json' };

describe('categories (meme-coin niche)', () => {
  it('lists the 12 meme-coin categories and none of the retired TA ones', () => {
    expect([...CATEGORIES].sort()).toEqual([
      'analysis', 'automation', 'chains', 'coins', 'concepts', 'education',
      'kols', 'platforms', 'risk', 'strategies', 'tools', 'wallets',
    ]);
    for (const old of ['exchanges', 'patterns', 'indicators']) {
      expect(isCategory(old)).toBe(false);
      expect(isLegacyCategory(old)).toBe(true);
      expect(isKnownCategory(old)).toBe(true);
    }
    expect(isKnownCategory('not-a-category')).toBe(false);
    expect(LEGACY_CATEGORIES).toHaveLength(3);
  });

  it('weekly rotation covers every category and sums to 25 DataForSEO tasks', () => {
    let sum = 0;
    for (const c of CATEGORIES) {
      expect(WEEKLY_ROTATION_COUNTS[c]).toBeGreaterThan(0);
      sum += WEEKLY_ROTATION_COUNTS[c];
    }
    expect(sum).toBe(25);
  });

  it('every category has hero image queries and an inline-source order', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_IMAGE_QUERY[c]).toBeTruthy();
      expect(CATEGORY_IMAGE_QUERY_WIDE[c]).toBeTruthy();
      expect(CATEGORY_INLINE_SOURCES[c].length).toBeGreaterThan(0);
    }
  });

  it('bundled seed list is the 228-keyword meme-coin list and only uses live categories', () => {
    const rows = seeds as Array<{ keyword: string; category: string }>;
    expect(rows).toHaveLength(228);
    const bad = rows.filter((r) => !isCategory(r.category));
    expect(bad).toEqual([]);
    const keys = rows.map((r) => r.keyword.toLowerCase().trim());
    expect(new Set(keys).size).toBe(rows.length);
    expect(rows.some((r) => /pump\.fun/i.test(r.keyword))).toBe(true);
  });
});
