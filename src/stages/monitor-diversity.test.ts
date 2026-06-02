import { describe, it, expect } from 'vitest';
import { analyzeDiversity, MONITOR_LOOKBACK } from './monitor-diversity';

describe('analyzeDiversity', () => {
  it('flags a feed that collapsed onto one topic + one category (fear-greed incident)', () => {
    const fng = ['fear and greed index', 'crypto fear and greed', 'market greed index', 'fear index crypto'];
    const rows = Array.from({ length: MONITOR_LOOKBACK }, (_, i) => ({
      category: 'analysis',
      keyword: fng[i % fng.length],
    }));
    const r = analyzeDiversity(rows);
    expect(r.distinctCategories).toBe(1);
    expect(r.topTopic && r.topTopic.count).toBeGreaterThan(4);
    expect(r.anomalies.length).toBeGreaterThan(0);
  });

  it('passes a healthy, diverse feed (many categories, no repeated topic)', () => {
    const rows = [
      { category: 'indicators', keyword: 'rsi divergence crypto' },
      { category: 'exchanges', keyword: 'bybit futures trading' },
      { category: 'patterns', keyword: 'bull flag crypto pattern' },
      { category: 'coins', keyword: 'eth futures trading' },
      { category: 'risk', keyword: 'crypto stop loss placement' },
      { category: 'concepts', keyword: 'crypto funding rate' },
      { category: 'education', keyword: 'how to trade crypto futures' },
      { category: 'strategies', keyword: 'crypto swing trading strategy' },
      { category: 'automation', keyword: 'crypto algo trading' },
      { category: 'analysis', keyword: 'crypto market structure' },
      { category: 'indicators', keyword: 'macd crypto futures' },
      { category: 'exchanges', keyword: 'okx leverage trading' },
      { category: 'coins', keyword: 'solana futures strategy' },
      { category: 'patterns', keyword: 'head and shoulders crypto' },
    ];
    const r = analyzeDiversity(rows);
    expect(r.sampled).toBe(MONITOR_LOOKBACK);
    expect(r.distinctCategories).toBeGreaterThanOrEqual(4);
    expect(r.anomalies).toEqual([]);
  });

  it('does not flag category-spread before a full window of data exists', () => {
    const rows = [
      { category: 'indicators', keyword: 'rsi divergence crypto' },
      { category: 'exchanges', keyword: 'bybit futures trading' },
    ];
    const r = analyzeDiversity(rows);
    expect(r.anomalies).toEqual([]); // < MONITOR_LOOKBACK rows → no premature alert
  });
});
