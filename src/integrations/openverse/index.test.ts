// src/integrations/openverse/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findInlineImage } from './index';

describe('openverse integration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  const validItem = {
    id: 'abc', title: 'Bitcoin chart',
    url: 'https://live.staticflickr.com/1/1.jpg',
    foreign_landing_url: 'https://www.flickr.com/photos/abc/1',
    creator: 'Jane Doe', creator_url: 'https://www.flickr.com/photos/abc',
    license: 'by', license_version: '2.0',
    license_url: 'https://creativecommons.org/licenses/by/2.0/',
    provider: 'flickr', source: 'flickr',
    width: 1200, height: 800, filetype: 'jpg',
  };

  it('returns null when no items', async () => {
    fetchMock.mockResolvedValueOnce(respond({ results: [] }));
    const result = await findInlineImage('anything');
    expect(result).toBeNull();
  });

  it('maps a CC BY image to InlineImageSource with attribution required', async () => {
    fetchMock.mockResolvedValueOnce(respond({ results: [validItem] }));
    const result = await findInlineImage('bitcoin');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://live.staticflickr.com/1/1.jpg');
    expect(result?.sourceName).toBe('Flickr');
    expect(result?.sourceUrl).toBe('https://www.flickr.com/photos/abc/1');
    expect(result?.altText).toBe('Bitcoin chart');
    expect(result?.license).toBe('CC BY 2.0');
    expect(result?.attribution).toBe('Jane Doe');
    expect(result?.requiresAttribution).toBe(true);
    expect(result?.width).toBe(1200);
    expect(result?.height).toBe(800);
  });

  it('formats Wikimedia provider and CC BY-SA license correctly', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [{ ...validItem, provider: 'wikimedia', license: 'by-sa', license_version: '4.0' }],
    }));
    const result = await findInlineImage('q');
    expect(result?.sourceName).toBe('Wikimedia Commons');
    expect(result?.license).toBe('CC BY-SA 4.0');
  });

  it('marks CC0 images as not requiring attribution', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [{ ...validItem, license: 'cc0', license_version: null, creator: null }],
    }));
    const result = await findInlineImage('q');
    expect(result?.license).toBe('CC0');
    expect(result?.requiresAttribution).toBe(false);
    expect(result?.attribution).toBeNull();
  });

  it('skips items below min dimensions in favour of larger ones', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [
        { ...validItem, id: 'small', url: 'https://s.jpg', width: 200, height: 150 },
        { ...validItem, id: 'big', url: 'https://b.jpg', width: 1000, height: 800 },
      ],
    }));
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://b.jpg');
  });

  it('returns null when no item meets minimums', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [{ ...validItem, width: 300, height: 200 }],
    }));
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('filters out SVG results (sharp cannot reliably rasterize them)', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [
        { ...validItem, id: 'svg', url: 'https://x/chart.svg', filetype: 'svg' },
        { ...validItem, id: 'jpg', url: 'https://x/photo.jpg', filetype: 'jpg' },
      ],
    }));
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://x/photo.jpg');
  });

  it('falls back to URL extension sniffing when filetype is null', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      results: [
        { ...validItem, id: 'svg', url: 'https://x/chart.svg', filetype: null },
        { ...validItem, id: 'jpg', url: 'https://x/photo.jpg', filetype: null },
      ],
    }));
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://x/photo.jpg');
  });
});
