// src/integrations/inline-images/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../openverse', () => ({ findInlineImage: vi.fn() }));
vi.mock('../wikimedia', () => ({ findInlineImage: vi.fn() }));
vi.mock('./download', () => ({ downloadAndSave: vi.fn() }));

import { findInlineImage as findOpenverse } from '../openverse';
import { findInlineImage as findWikimedia } from '../wikimedia';
import { downloadAndSave } from './download';
import { fetchInlineSource, resolvePlaceholder } from './index';

describe('inline-images orchestrator', () => {
  beforeEach(() => {
    (findOpenverse as unknown as vi.Mock).mockReset();
    (findWikimedia as unknown as vi.Mock).mockReset();
    (downloadAndSave as unknown as vi.Mock).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  const openverseResult = {
    url: 'https://live.staticflickr.com/img.jpg',
    sourceName: 'Flickr',
    sourceUrl: 'https://www.flickr.com/photos/abc/1',
    altText: 'alt',
    width: 1000, height: 700,
    license: 'CC BY 2.0',
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

  it('fetchInlineSource returns Openverse result when available', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(openverseResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(openverseResult);
    expect(findWikimedia).not.toHaveBeenCalled();
  });

  it('fetchInlineSource falls back to Wikimedia when Openverse returns null', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(wikimediaResult);
  });

  it('fetchInlineSource returns null when both sources miss', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('q');
    expect(result).toBeNull();
  });

  it('fetchInlineSource retries both sources with a 3-word version when the full query misses', async () => {
    (findOpenverse as unknown as vi.Mock)
      .mockResolvedValueOnce(null)       // full query: openverse miss
      .mockResolvedValueOnce(openverseResult); // 3-word query: openverse hit
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null); // full query: wikimedia miss

    const result = await fetchInlineSource('Bybit futures perpetual contract trading interface');

    expect(result).toEqual(openverseResult);
    expect((findOpenverse as unknown as vi.Mock).mock.calls[0][0]).toBe('Bybit futures perpetual contract trading interface');
    expect((findOpenverse as unknown as vi.Mock).mock.calls[1][0]).toBe('Bybit futures perpetual');
  });

  it('fetchInlineSource does not retry a short (<=3 word) query', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('ethereum ETH');
    expect(result).toBeNull();
    expect(findOpenverse).toHaveBeenCalledTimes(1);
    expect(findWikimedia).toHaveBeenCalledTimes(1);
  });

  it('resolvePlaceholder downloads the image and returns a figure HTML block', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(openverseResult);
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
    expect(result?.figureHtml).toContain('Flickr');
    expect(result?.figureHtml).toContain('CC BY 2.0');
    expect(result?.figureHtml).toContain('Jane Doe');
    expect(downloadAndSave).toHaveBeenCalledWith(openverseResult.url, 'slug-inline-1', 800, 450);
  });

  it('resolvePlaceholder includes the artist name when attribution is present', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(null);
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
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await resolvePlaceholder('q', 'c', 'stem');
    expect(result).toBeNull();
    expect(downloadAndSave).not.toHaveBeenCalled();
  });

  it('resolvePlaceholder HTML-escapes caption content', async () => {
    (findOpenverse as unknown as vi.Mock).mockResolvedValueOnce(openverseResult);
    (downloadAndSave as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/s.jpg', filename: 's.jpg',
    });
    const result = await resolvePlaceholder('q', 'Hello "world" <evil>', 'stem');
    expect(result?.figureHtml).toContain('Hello &quot;world&quot; &lt;evil&gt;');
    expect(result?.figureHtml).not.toContain('<evil>');
  });
});
