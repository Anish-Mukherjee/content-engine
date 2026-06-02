// src/config/topic-clusters.test.ts
import { describe, it, expect } from 'vitest';
import { clusterTags, intersects, saturationTags, UNIVERSAL_TOKENS } from './topic-clusters';

describe('clusterTags', () => {
  it('tags every recent published "bot" article as bot cluster', () => {
    expect(clusterTags('crypto trading bot')).toContain('bot');
    expect(clusterTags('ai bots for trading')).toContain('bot');
    expect(clusterTags('best ai trading bot')).toContain('bot');
    expect(clusterTags('best trading bot')).toContain('bot');
    expect(clusterTags('automated crypto trading')).toContain('bot');
    expect(clusterTags('best automated crypto trading platform')).toContain('bot');
    expect(clusterTags('automated trading bots')).toContain('bot');
    expect(clusterTags('day trading bot')).toContain('bot');
  });

  it('also tags AI-focused articles as bot cluster (same content cluster)', () => {
    expect(clusterTags('artificial intelligence crypto trading')).toContain('bot');
    expect(clusterTags('ai crypto trading')).toContain('bot');
  });

  it('tags algo/algorithmic trading as bot cluster', () => {
    expect(clusterTags('crypto algo trading')).toContain('bot');
    expect(clusterTags('algorithmic crypto trading')).toContain('bot');
  });

  it('tags "best crypto trading bot for beginners" as bot cluster', () => {
    expect(clusterTags('best crypto trading bot for beginners')).toContain('bot');
  });

  it('tags coin-specific keywords with the coin cluster', () => {
    expect(clusterTags('bitcoin futures trading')).toContain('bitcoin');
    expect(clusterTags('btc futures strategy')).toContain('bitcoin'); // btc → bitcoin via alias
    expect(clusterTags('ethereum futures analysis')).toContain('ethereum');
    expect(clusterTags('eth futures trading')).toContain('ethereum');
    expect(clusterTags('solana futures')).toContain('solana');
  });

  it('tags exchange-specific keywords with the exchange cluster', () => {
    expect(clusterTags('bybit futures trading')).toContain('bybit');
    expect(clusterTags('binance perpetual contracts')).toContain('binance');
    expect(clusterTags('okx leverage trading')).toContain('okx');
  });

  it('tags indicator articles', () => {
    expect(clusterTags('rsi divergence crypto')).toContain('rsi');
    expect(clusterTags('macd crypto futures')).toContain('macd');
    expect(clusterTags('200 ema crypto trading')).toContain('ema');
    expect(clusterTags('bollinger bands crypto')).toContain('bollinger');
  });

  it('tags candlestick and chart pattern articles', () => {
    expect(clusterTags('cryptocurrency candlestick patterns')).toContain('candlestick');
    expect(clusterTags('crypto candlestick chart')).toContain('candlestick');
    expect(clusterTags('doji candle crypto')).toContain('candlestick');
    expect(clusterTags('hammer candle crypto trading')).toContain('candlestick');
    expect(clusterTags('double bottom crypto trading')).toContain('doublepattern');
    expect(clusterTags('head and shoulders crypto')).toContain('headshoulders');
    expect(clusterTags('bull flag crypto pattern')).toContain('trianglepattern');
    expect(clusterTags('rising wedge crypto')).toContain('trianglepattern');
  });

  it('tags leverage and margin variants together', () => {
    expect(clusterTags('crypto leverage trading')).toContain('leverage');
    expect(clusterTags('crypto margin trading')).toContain('leverage');
    expect(clusterTags('100x leverage crypto')).toContain('leverage');
  });

  it('returns empty set for keywords with no anchors (pure platform topics)', () => {
    expect(clusterTags('crypto futures trading us')).toEqual(new Set());
    expect(clusterTags('crypto market analysis')).toEqual(new Set());
    expect(clusterTags('crypto market structure')).toEqual(new Set());
    expect(clusterTags('how to trade crypto futures')).toEqual(new Set());
    expect(clusterTags('crypto technical analysis')).toEqual(new Set());
  });

  it('handles multi-cluster keywords (e.g. coin + exchange)', () => {
    const tags = clusterTags('bybit bitcoin futures');
    expect(tags).toContain('bybit');
    expect(tags).toContain('bitcoin');
  });
});

describe('intersects', () => {
  it('detects when any tag is in the cooldown set', () => {
    expect(intersects(new Set(['bot', 'bitcoin']), new Set(['bot']))).toBe(true);
    expect(intersects(new Set(['bot']), new Set(['bot', 'bitcoin']))).toBe(true);
    expect(intersects(new Set(['rsi']), new Set(['bot']))).toBe(false);
    expect(intersects(new Set(), new Set(['bot']))).toBe(false);
  });
});

describe('saturationTags', () => {
  // The June 2026 incident: these all published back-to-back because clusterTags
  // returned ∅ for every one of them. saturationTags must give them overlapping
  // keys so the cooldown catches them.
  const incidentKeywords = [
    'bitcoinfear and greed index', 'crypto fear and greed index live', 'greed index crypto',
    'fear and greed', 'fear and greed index today', 'crypto fear and greed',
    'fear and greed index chart', 'market greed index', 'fear index crypto',
  ];

  it('INVARIANT: never returns an empty set for any keyword with a real token', () => {
    for (const kw of incidentKeywords) {
      expect(clusterTags(kw)).toEqual(new Set()); // precondition: these are clusterless
      expect(saturationTags(kw).size).toBeGreaterThan(0); // but saturationTags still tags them
    }
    expect(saturationTags('crypto market analysis').size).toBeGreaterThan(0);
    expect(saturationTags('crypto futures trading us').size).toBeGreaterThan(0);
  });

  it('gives fear-and-greed variants overlapping tags so cooldown suppresses them', () => {
    // Publishing the first puts its tags on cooldown; every other variant must
    // intersect that set and therefore be skipped.
    const cooldown = saturationTags('fear and greed index');
    for (const kw of incidentKeywords) {
      expect(intersects(saturationTags(kw), cooldown)).toBe(true);
    }
  });

  it('prefers curated clusters over the token fallback (no double-counting)', () => {
    expect(saturationTags('bitcoin futures trading')).toEqual(new Set(['bitcoin']));
    expect(saturationTags('btc futures strategy')).toEqual(new Set(['bitcoin']));
    expect(saturationTags('crypto trading bot')).toEqual(new Set(['bot']));
    expect(saturationTags('crypto margin trading')).toEqual(new Set(['leverage']));
  });

  it('falls back to salient (non-universal) tokens, prefixed kw:', () => {
    expect(saturationTags('fear and greed index')).toEqual(new Set(['kw:fear', 'kw:greed', 'kw:index']));
    // platform words are dropped from the fallback so the queue is not over-cooled
    for (const t of saturationTags('fear and greed index')) {
      expect(UNIVERSAL_TOKENS.has(t.replace('kw:', ''))).toBe(false);
    }
  });

  it('keeps genuinely different topics from colliding', () => {
    expect(intersects(saturationTags('fear and greed index'), saturationTags('crypto scalping strategy'))).toBe(false);
    expect(intersects(saturationTags('crypto fear index'), saturationTags('bitcoin futures trading'))).toBe(false);
  });

  it('still returns a non-empty key when every token is universal or the signature is empty', () => {
    expect(saturationTags('crypto futures trading').size).toBeGreaterThan(0); // all-universal
    expect(saturationTags('best of the')).toEqual(new Set(['kw:sigless'])); // all stop-words
  });
});
