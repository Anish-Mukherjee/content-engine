// src/integrations/pexels/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findInlineImage } from './index';

describe('pexels integration', () => {
  const fetchMock = vi.fn();
  const ORIGINAL_KEY = process.env.PEXELS_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.PEXELS_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = ORIGINAL_KEY;
  });

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  function makePhoto(overrides: Partial<{
    id: number; width: number; height: number; url: string;
    photographer: string; photographer_url: string;
    largeUrl: string; alt: string;
  }> = {}) {
    return {
      id: overrides.id ?? 1,
      width: overrides.width ?? 4000,
      height: overrides.height ?? 2400,
      url: overrides.url ?? 'https://www.pexels.com/photo/abc-1',
      photographer: overrides.photographer ?? 'Jane Doe',
      photographer_url: overrides.photographer_url ?? 'https://www.pexels.com/@jane',
      src: {
        original: 'https://images.pexels.com/photos/1/o.jpeg',
        large2x: 'https://images.pexels.com/photos/1/o.jpeg?h=650&dpr=2',
        large: overrides.largeUrl ?? 'https://images.pexels.com/photos/1/o.jpeg?h=650&w=940',
        medium: 'https://images.pexels.com/photos/1/o.jpeg?h=350',
        small: 'https://images.pexels.com/photos/1/o.jpeg?h=130',
        portrait: 'https://images.pexels.com/photos/1/o.jpeg?fit=crop&h=1200&w=800',
        landscape: 'https://images.pexels.com/photos/1/o.jpeg?fit=crop&h=627&w=1200',
        tiny: 'https://images.pexels.com/photos/1/o.jpeg?h=200&w=280',
      },
      alt: overrides.alt ?? 'A trader looking at multiple monitors with charts',
    };
  }

  it('returns null when API returns zero photos', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [], total_results: 0 }));
    const result = await findInlineImage('crypto candlestick patterns nobody photographs');
    expect(result).toBeNull();
  });

  it('maps a photo to InlineImageSource with Pexels License + photographer attribution', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [makePhoto()] }));
    const result = await findInlineImage('bitcoin trader');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://images.pexels.com/photos/1/o.jpeg?h=650&w=940');
    expect(result?.sourceName).toBe('Pexels');
    expect(result?.sourceUrl).toBe('https://www.pexels.com/photo/abc-1');
    expect(result?.altText).toBe('A trader looking at multiple monitors with charts');
    expect(result?.license).toBe('Pexels License');
    expect(result?.attribution).toBe('Jane Doe');
    expect(result?.requiresAttribution).toBe(true);
    expect(result?.width).toBe(4000);
    expect(result?.height).toBe(2400);
  });

  it('uses the `large` src variant as the download URL (not `original`)', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [makePhoto({ largeUrl: 'https://images.pexels.com/x/large.jpg?h=650&w=940' })],
    }));
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://images.pexels.com/x/large.jpg?h=650&w=940');
    expect(result?.url).not.toContain('/o.jpeg?');
  });

  it('skips photos below the 600x400 minimum and picks the next usable one', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [
        makePhoto({ id: 1, width: 400, height: 300, largeUrl: 'https://x/small.jpg?h=300' }),
        makePhoto({ id: 2, width: 1000, height: 800, largeUrl: 'https://x/big.jpg?h=650' }),
      ],
    }));
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://x/big.jpg?h=650');
  });

  it('returns null when no photo meets the minimum size', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [makePhoto({ width: 400, height: 200, largeUrl: 'https://x/tiny.jpg?h=200' })],
    }));
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('rejects unsupported formats by URL extension (e.g. .svg)', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [makePhoto({ largeUrl: 'https://x/diagram.svg' })],
    }));
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('preserves empty altText when Pexels returns no alt (rare)', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [makePhoto({ alt: '' })],
    }));
    const result = await findInlineImage('q');
    expect(result?.altText).toBe('');
  });

  it('returns null when photographer is empty (attribution still tracked)', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      photos: [makePhoto({ photographer: '' })],
    }));
    const result = await findInlineImage('q');
    expect(result?.attribution).toBeNull();
    expect(result?.requiresAttribution).toBe(true);
  });
});
