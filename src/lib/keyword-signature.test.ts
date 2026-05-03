// src/lib/keyword-signature.test.ts
import { describe, it, expect } from 'vitest';
import { signature } from './keyword-signature';

describe('keyword signature', () => {
  it('is order-invariant for the same tokens', () => {
    expect(signature('crypto trading bot')).toBe(signature('bot crypto trading'));
    expect(signature('crypto trading bot')).toBe(signature('trading bot crypto'));
    expect(signature('crypto trading bot')).toBe(signature('bot trading crypto'));
  });

  it('drops marketing stop-words like best/top/the', () => {
    expect(signature('best crypto trading bot')).toBe(signature('crypto trading bot'));
    expect(signature('top crypto trading bot')).toBe(signature('crypto trading bot'));
    expect(signature('the best crypto trading bot')).toBe(signature('crypto trading bot'));
  });

  it('drops connector stop-words like for/of/with/to', () => {
    expect(signature('bot for trading')).toBe(signature('trading bot'));
    expect(signature('crypto with leverage')).toBe(signature('leverage crypto'));
    expect(signature('how to trade crypto')).toBe(signature('trade crypto'));
  });

  it('lemmatizes common plural and verb forms', () => {
    expect(signature('crypto trading bots')).toBe(signature('crypto trading bot'));
    expect(signature('crypto traders')).toBe(signature('crypto trading'));
    expect(signature('crypto strategies')).toBe(signature('crypto strategy'));
    expect(signature('crypto indicators')).toBe(signature('crypto indicator'));
    expect(signature('crypto patterns')).toBe(signature('crypto pattern'));
    expect(signature('crypto exchanges')).toBe(signature('crypto exchange'));
  });

  it('canonicalises crypto/cryptocurrency synonyms', () => {
    expect(signature('cryptocurrency trading bot')).toBe(signature('crypto trading bot'));
    expect(signature('automated cryptocurrency trading')).toBe(signature('automated crypto trading'));
  });

  it('canonicalises ai / artificial intelligence', () => {
    expect(signature('ai trading bot')).toBe(signature('artificial intelligence trading bot'));
  });

  it('canonicalises auto / automated / automation', () => {
    expect(signature('auto trading bot')).toBe(signature('automated trading bot'));
    expect(signature('crypto auto trading')).toBe(signature('automated crypto trading'));
  });

  it('canonicalises robot/robots and bot/bots together', () => {
    expect(signature('crypto robot trading')).toBe(signature('crypto trading bot'));
    expect(signature('cryptocurrency trading robot')).toBe(signature('crypto trading bot'));
  });

  it('canonicalises ticker abbreviations to full coin name', () => {
    expect(signature('btc futures trading')).toBe(signature('bitcoin futures trading'));
    expect(signature('eth futures strategy')).toBe(signature('ethereum futures strategy'));
  });

  it('treats meaningful modifiers (ai, free, beginners) as distinct', () => {
    expect(signature('ai crypto trading bot')).not.toBe(signature('crypto trading bot'));
    expect(signature('free crypto trading bot')).not.toBe(signature('crypto trading bot'));
    expect(signature('crypto trading bot for beginners')).not.toBe(signature('crypto trading bot'));
  });

  it('treats different concepts as distinct', () => {
    expect(signature('crypto leverage trading')).not.toBe(signature('crypto margin trading'));
    expect(signature('rsi crypto trading')).not.toBe(signature('macd crypto trading'));
    expect(signature('bybit futures trading')).not.toBe(signature('binance futures trading'));
  });

  it('keeps numeric modifiers like 100x distinct', () => {
    expect(signature('100x leverage crypto')).not.toBe(signature('leverage crypto'));
  });

  it('is robust to punctuation, casing and extra whitespace', () => {
    expect(signature('  Crypto-Trading Bot!  ')).toBe(signature('crypto trading bot'));
    expect(signature('crypto/trading/bot')).toBe(signature('crypto trading bot'));
  });

  it('deduplicates repeated tokens within a keyword', () => {
    expect(signature('crypto crypto trading bot')).toBe(signature('crypto trading bot'));
  });

  it('returns empty string for keyword that is all stop-words', () => {
    expect(signature('best of the')).toBe('');
  });

  it('lemmatizes generic plural-s tokens not covered by aliases', () => {
    expect(signature('crypto market trends')).toBe(signature('crypto market trend'));
    expect(signature('crypto funding rates')).toBe(signature('crypto funding rate'));
    expect(signature('crypto take profit levels')).toBe(signature('crypto take profit level'));
    expect(signature('best cryptos to day trade')).toBe(signature('best crypto for day trading'));
  });

  it('lemmatizes -ies → -y plurals', () => {
    expect(signature('crypto industries')).toBe(signature('crypto industry'));
    expect(signature('crypto currencies')).toBe(signature('crypto currency'));
  });

  it('does not over-strip non-plural words ending in s', () => {
    expect(signature('crypto basis trade')).not.toBe(signature('crypto bas trade'));
    expect(signature('crypto analysis')).not.toBe(signature('crypto analysi'));
    expect(signature('crypto address')).not.toBe(signature('crypto addres'));
    expect(signature('crypto bonus')).not.toBe(signature('crypto bonu'));
  });
});
