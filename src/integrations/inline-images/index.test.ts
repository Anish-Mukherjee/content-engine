// src/integrations/inline-images/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../pexels', () => ({ findInlineImage: vi.fn() }));
vi.mock('../wikimedia', () => ({ findInlineImage: vi.fn() }));
vi.mock('./download', () => ({ downloadAndSave: vi.fn() }));

import { findInlineImage as findPexels } from '../pexels';
import { findInlineImage as findWikimedia } from '../wikimedia';
import { downloadAndSave } from './download';
import { fetchInlineSource, resolvePlaceholder } from './index';

describe('inline-images orchestrator', () => {
  beforeEach(() => {
    (findPexels as unknown as vi.Mock).mockReset();
    (findWikimedia as unknown as vi.Mock).mockReset();
    (downloadAndSave as unknown as vi.Mock).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  const pexelsResult = {
    url: 'https://images.pexels.com/photos/1/img.jpg?h=650',
    sourceName: 'Pexels',
    sourceUrl: 'https://www.pexels.com/photo/abc-1',
    altText: 'A trader looking at multiple monitors with charts',
    width: 4000, height: 2400,
    license: 'Pexels License',
    attribution: 'Jane Doe',
    requiresAttribution: true,
  };
  const wikimediaResult = {
    url: 'https://upload.wikimedia.org/w.jpg',
    sourceName: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:W.jpg',
    altText: 'w alt',
    width: 1000, height: 700,
    license: 'CC BY-SA 4.0',
    attribution: 'Jane Doe',
    requiresAttribution: true,
  };

  it('fetchInlineSource returns Pexels result when available (Pexels is primary)', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(pexelsResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(pexelsResult);
    expect(findWikimedia).not.toHaveBeenCalled();
  });

  it('fetchInlineSource falls back to Wikimedia when Pexels returns null', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(wikimediaResult);
  });

  it('fetchInlineSource returns null when both sources miss', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('q');
    expect(result).toBeNull();
  });

  it('fetchInlineSource retries both sources with a 3-word version when the full query misses', async () => {
    (findPexels as unknown as vi.Mock)
      .mockResolvedValueOnce(null)        // full query: pexels miss
      .mockResolvedValueOnce(pexelsResult); // 3-word query: pexels hit
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null); // full query: wikimedia miss

    const result = await fetchInlineSource('Bybit futures perpetual contract trading interface');

    expect(result).toEqual(pexelsResult);
    expect((findPexels as unknown as vi.Mock).mock.calls[0][0]).toBe('Bybit futures perpetual contract trading interface');
    expect((findPexels as unknown as vi.Mock).mock.calls[1][0]).toBe('Bybit futures perpetual');
  });

  it('fetchInlineSource falls through to Wikimedia when Pexels throws (e.g. 401, network)', async () => {
    (findPexels as unknown as vi.Mock).mockRejectedValueOnce(new Error('pexels 401'));
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(wikimediaResult);
  });

  it('fetchInlineSource returns null when all sources throw', async () => {
    (findPexels as unknown as vi.Mock).mockRejectedValueOnce(new Error('pexels down'));
    (findWikimedia as unknown as vi.Mock).mockRejectedValueOnce(new Error('wm down'));
    const result = await fetchInlineSource('q');
    expect(result).toBeNull();
  });

  it('fetchInlineSource does not retry a short (<=3 word) query', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('ethereum ETH');
    expect(result).toBeNull();
    expect(findPexels).toHaveBeenCalledTimes(1);
    expect(findWikimedia).toHaveBeenCalledTimes(1);
  });

  it('resolvePlaceholder downloads the image and returns a figure HTML block crediting Pexels', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(pexelsResult);
    (downloadAndSave as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/slug-inline-1.jpg',
      filename: 'slug-inline-1.jpg',
    });

    const result = await resolvePlaceholder('bybit interface', 'Bybit interface', 'slug-inline-1');
    expect(result).not.toBeNull();
    expect(result?.localUrl).toBe('/images/slug-inline-1.jpg');
    expect(result?.figureHtml).toContain('<figure class="article-image">');
    expect(result?.figureHtml).toContain('src="/images/slug-inline-1.jpg"');
    expect(result?.figureHtml).toContain('alt="Bybit interface"');
    expect(result?.figureHtml).toContain('width="800"');
    expect(result?.figureHtml).toContain('height="450"');
    expect(result?.figureHtml).toContain('loading="lazy"');
    expect(result?.figureHtml).toContain('<figcaption>');
    expect(result?.figureHtml).toContain('Pexels');
    expect(result?.figureHtml).toContain('Pexels License');
    expect(result?.figureHtml).toContain('Jane Doe');
    expect(downloadAndSave).toHaveBeenCalledWith(pexelsResult.url, 'slug-inline-1', 800, 450);
  });

  it('resolvePlaceholder includes the artist name when attribution is present', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    (downloadAndSave as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/slug-inline-2.jpg', filename: 'slug-inline-2.jpg',
    });

    const result = await resolvePlaceholder('q', 'cap', 'slug-inline-2');
    expect(result?.figureHtml).toContain('Jane Doe');
    expect(result?.figureHtml).toContain('Wikimedia Commons');
    expect(result?.figureHtml).toContain('CC BY-SA 4.0');
  });

  it('resolvePlaceholder returns null when neither source has a candidate', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await resolvePlaceholder('q', 'c', 'stem');
    expect(result).toBeNull();
    expect(downloadAndSave).not.toHaveBeenCalled();
  });

  it('resolvePlaceholder HTML-escapes caption content', async () => {
    (findPexels as unknown as vi.Mock).mockResolvedValueOnce(pexelsResult);
    (downloadAndSave as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/s.jpg', filename: 's.jpg',
    });
    const result = await resolvePlaceholder('q', 'Hello "world" <evil>', 'stem');
    expect(result?.figureHtml).toContain('Hello &quot;world&quot; &lt;evil&gt;');
    expect(result?.figureHtml).not.toContain('<evil>');
  });
});
