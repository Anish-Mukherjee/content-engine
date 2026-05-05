// src/integrations/pixabay/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchImages } from './client';
import { findInlineCandidates } from './index';

vi.mock('./client');

describe('pixabay findInlineCandidates', () => {
  beforeEach(() => vi.mocked(searchImages).mockReset());

  it('returns empty when api returns no hits', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([]);
    const out = await findInlineCandidates('q');
    expect(out).toEqual([]);
  });

  it('maps a hit to a candidate using largeImageURL and id as sourceId', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 195893,
        pageURL: 'https://pixabay.com/photos/blossom-bloom-flower-195893/',
        type: 'photo',
        tags: 'blossom, bloom, flower',
        webformatURL: 'https://cdn.pixabay.com/get/195893_640.jpg',
        webformatWidth: 640,
        webformatHeight: 426,
        largeImageURL: 'https://cdn.pixabay.com/get/195893_1280.jpg',
        imageWidth: 4900,
        imageHeight: 3267,
        user: 'Josch13',
      },
    ]);
    const out = await findInlineCandidates('blossom');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('195893');
    expect(out[0].inlineSource.url).toBe('https://cdn.pixabay.com/get/195893_1280.jpg');
    expect(out[0].inlineSource.sourceName).toBe('Pixabay');
    expect(out[0].inlineSource.sourceUrl).toBe('https://pixabay.com/photos/blossom-bloom-flower-195893/');
    expect(out[0].inlineSource.width).toBe(4900);
    expect(out[0].inlineSource.height).toBe(3267);
    expect(out[0].inlineSource.license).toBe('Pixabay Content License');
    expect(out[0].inlineSource.requiresAttribution).toBe(false);
    expect(out[0].inlineSource.altText).toBe('blossom, bloom, flower');
  });

  it('falls back to query as altText when tags are missing', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 1, pageURL: 'https://pixabay.com/photos/x-1/', type: 'photo',
        tags: '',
        webformatURL: 'https://cdn/1_640.jpg', webformatWidth: 640, webformatHeight: 426,
        largeImageURL: 'https://cdn/1_1280.jpg', imageWidth: 1280, imageHeight: 853,
        user: 'A',
      },
    ]);
    const out = await findInlineCandidates('a fallback query');
    expect(out[0].inlineSource.altText).toBe('a fallback query');
  });

  it('filters out hits with imageWidth < 600 or imageHeight < 400', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 1, pageURL: 'p', type: 'photo', tags: 't',
        webformatURL: 'w', webformatWidth: 500, webformatHeight: 300,
        largeImageURL: 'l', imageWidth: 599, imageHeight: 800, user: 'u',
      },
      {
        id: 2, pageURL: 'p', type: 'photo', tags: 't',
        webformatURL: 'w', webformatWidth: 500, webformatHeight: 300,
        largeImageURL: 'l', imageWidth: 800, imageHeight: 399, user: 'u',
      },
      {
        id: 3, pageURL: 'p', type: 'photo', tags: 't',
        webformatURL: 'w', webformatWidth: 640, webformatHeight: 426,
        largeImageURL: 'l3', imageWidth: 1200, imageHeight: 800, user: 'u',
      },
    ]);
    const out = await findInlineCandidates('q');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('3');
  });
});
