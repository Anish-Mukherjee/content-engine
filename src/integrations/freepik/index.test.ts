// src/integrations/freepik/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./client', () => ({
  searchImages: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

import { findInlineImage } from './index';
import { getDownloadUrl, searchImages } from './client';

describe('freepik integration', () => {
  beforeEach(() => {
    (searchImages as unknown as vi.Mock).mockReset();
    (getDownloadUrl as unknown as vi.Mock).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  function makePhoto(overrides: Partial<{
    id: number; title: string; url: string;
    type: string; orientation: string;
    sourceUrl: string; sourceSize: string;
    authorName: string;
    licenseType: string;
  }> = {}) {
    return {
      id: overrides.id ?? 1,
      title: overrides.title ?? 'A trader looking at multiple monitors with charts',
      url: overrides.url ?? 'https://www.freepik.com/free-photo/trader_1.htm',
      filename: '1.jpg',
      licenses: [{ type: overrides.licenseType ?? 'freemium', url: 'https://lic' }],
      image: {
        type: overrides.type ?? 'photo',
        orientation: overrides.orientation ?? 'horizontal',
        source: {
          key: 'large',
          url: overrides.sourceUrl ?? 'https://img.b2bpic.net/free-photo/x.jpg',
          size: overrides.sourceSize ?? '626x417',
        },
      },
      author: { id: 1, name: overrides.authorName ?? 'Jane Doe', slug: 'jane', avatar: '', assets: 1 },
    };
  }

  it('returns null when search returns zero photos', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([]);
    const result = await findInlineImage('crypto candlestick patterns nobody photographs');
    expect(result).toBeNull();
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it('maps a photo to InlineImageSource flagged as attribution-free (paid Freepik plan)', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([makePhoto()]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce(
      'https://img.freepik.com/free-photo/x.jpg?size=1500&t=...',
    );
    const result = await findInlineImage('bitcoin trader');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://img.freepik.com/free-photo/x.jpg?size=1500&t=...');
    expect(result?.sourceName).toBe('Freepik');
    expect(result?.sourceUrl).toBe('https://www.freepik.com/free-photo/trader_1.htm');
    expect(result?.altText).toBe('A trader looking at multiple monitors with charts');
    expect(result?.license).toBe('Freepik License');
    // Paid plan does not require crediting the author per Freepik's docs.
    expect(result?.attribution).toBeNull();
    expect(result?.requiresAttribution).toBe(false);
    expect(result?.width).toBe(626);
    expect(result?.height).toBe(417);
  });

  it('uses the medium download URL (not the small preview URL)', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([makePhoto({
      sourceUrl: 'https://img.b2bpic.net/preview/x.jpg',
    })]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce(
      'https://img.freepik.com/full/x.jpg?size=1500',
    );
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://img.freepik.com/full/x.jpg?size=1500');
    expect(result?.url).not.toContain('b2bpic.net');
  });

  it('skips non-photo image types (e.g. vector) and picks the next usable one', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      makePhoto({ id: 1, type: 'vector' }),
      makePhoto({ id: 2 }),
    ]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce(
      'https://img.freepik.com/x2.jpg',
    );
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://img.freepik.com/x2.jpg');
    expect(getDownloadUrl).toHaveBeenCalledWith(2);
  });

  it('skips photos below the 600x400 minimum and picks the next usable one', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      makePhoto({ id: 1, sourceSize: '400x300' }),
      makePhoto({ id: 2, sourceSize: '1000x800' }),
    ]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce(
      'https://img.freepik.com/x2.jpg',
    );
    const result = await findInlineImage('q');
    expect(result?.url).toBe('https://img.freepik.com/x2.jpg');
    expect(getDownloadUrl).toHaveBeenCalledWith(2);
  });

  it('returns null when no photo meets the minimum size', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      makePhoto({ sourceSize: '400x300' }),
    ]);
    const result = await findInlineImage('q');
    expect(result).toBeNull();
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns null when source.size is malformed', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      makePhoto({ sourceSize: 'unknown' }),
    ]);
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('preserves empty altText when title is empty', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([makePhoto({ title: '' })]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce('https://img.freepik.com/x.jpg');
    const result = await findInlineImage('q');
    expect(result?.altText).toBe('');
  });

  it('attribution stays null regardless of author name (paid plan)', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([makePhoto({ authorName: '' })]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce('https://img.freepik.com/x.jpg');
    const result = await findInlineImage('q');
    expect(result?.attribution).toBeNull();
    expect(result?.requiresAttribution).toBe(false);
  });

  it('only calls getDownloadUrl once (for the first usable candidate)', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      makePhoto({ id: 1 }),
      makePhoto({ id: 2 }),
      makePhoto({ id: 3 }),
    ]);
    (getDownloadUrl as unknown as vi.Mock).mockResolvedValueOnce('https://img.freepik.com/x.jpg');
    await findInlineImage('q');
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
    expect(getDownloadUrl).toHaveBeenCalledWith(1);
  });
});
