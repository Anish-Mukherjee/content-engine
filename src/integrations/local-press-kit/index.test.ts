// src/integrations/local-press-kit/index.test.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { detectExchangeSlug, findInlineCandidates } from './index';

describe('detectExchangeSlug', () => {
  it('matches a single-word exchange slug case-insensitively', () => {
    expect(detectExchangeSlug('Bybit perpetual interface')).toBe('bybit');
    expect(detectExchangeSlug('binance futures')).toBe('binance');
    expect(detectExchangeSlug('OKX trading')).toBe('okx');
  });

  it('normalizes dotted/spaced multi-word names to slug form', () => {
    expect(detectExchangeSlug('Gate.io trading guide')).toBe('gateio');
    expect(detectExchangeSlug('Crypto.com futures')).toBe('cryptocom');
    expect(detectExchangeSlug('crypto com fees')).toBe('cryptocom');
  });

  it('returns null when no known exchange appears', () => {
    expect(detectExchangeSlug('candlestick pattern')).toBeNull();
    expect(detectExchangeSlug('')).toBeNull();
    expect(detectExchangeSlug('random text')).toBeNull();
  });

  it('uses word boundaries — does not match substrings of other words', () => {
    // "okxoo" is not a real exchange and shouldn't trigger an OKX match.
    expect(detectExchangeSlug('okxoo trading')).toBeNull();
  });
});

describe('findInlineCandidates (filesystem-backed)', () => {
  let tmpRoot: string;
  const origStorageDir = process.env.STORAGE_DIR;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'press-kit-test-'));
    process.env.STORAGE_DIR = tmpRoot;
  });

  afterEach(async () => {
    if (origStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = origStorageDir;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns [] when query has no exchange slug', async () => {
    expect(await findInlineCandidates('candlestick pattern')).toEqual([]);
  });

  it('returns [] when the exchange directory does not exist yet', async () => {
    expect(await findInlineCandidates('Bybit interface')).toEqual([]);
  });

  it('returns [] when directory exists but contains no supported images', async () => {
    const dir = path.join(tmpRoot, 'exchange-assets', 'bybit');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# put images here\n');
    expect(await findInlineCandidates('Bybit perpetual')).toEqual([]);
  });

  it('returns a candidate per readable image file', async () => {
    const dir = path.join(tmpRoot, 'exchange-assets', 'bybit');
    await fs.mkdir(dir, { recursive: true });
    // 1×1 PNG (smallest valid PNG) — sharp can read its metadata.
    const onePxPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await fs.writeFile(path.join(dir, 'logo.png'), onePxPng);
    await fs.writeFile(path.join(dir, 'ignore.txt'), 'not an image');

    const cands = await findInlineCandidates('Bybit interface');
    expect(cands).toHaveLength(1);
    expect(cands[0].sourceId).toBe('bybit/logo.png');
    expect(cands[0].inlineSource.url).toMatch(/^file:\/\//);
    expect(cands[0].inlineSource.url).toContain('logo.png');
    expect(cands[0].inlineSource.requiresAttribution).toBe(false);
    expect(cands[0].inlineSource.sourceName).toBe('Bybit press kit');
    expect(cands[0].inlineSource.license).toBe('Press kit / official brand asset');
  });
});
