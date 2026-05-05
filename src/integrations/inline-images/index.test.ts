// src/integrations/inline-images/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../freepik', () => ({
  findInlineImage: vi.fn(), findInlineCandidates: vi.fn(),
}));
vi.mock('../wikimedia', () => ({
  findInlineImage: vi.fn(), findInlineCandidates: vi.fn(),
}));
vi.mock('../pixabay', () => ({
  findInlineImage: vi.fn(), findInlineCandidates: vi.fn(),
}));
vi.mock('../pexels', () => ({
  findInlineImage: vi.fn(), findInlineCandidates: vi.fn(),
}));
vi.mock('../unsplash/inline', () => ({
  findInlineImage: vi.fn(), findInlineCandidates: vi.fn(),
}));
vi.mock('./download', () => ({ downloadAndSave: vi.fn() }));

import { findInlineImage as findFreepik } from '../freepik';
import { findInlineImage as findWikimedia } from '../wikimedia';
import { findInlineImage as findPixabay } from '../pixabay';
import { findInlineImage as findPexels } from '../pexels';
import { findInlineImage as findUnsplashInline } from '../unsplash/inline';
import { downloadAndSave } from './download';
import { fetchInlineSource, resolvePlaceholder } from './index';
import { fetchInlineCandidates } from './index';
import { findInlineCandidates as findFreepikCandidates } from '../freepik';
import { findInlineCandidates as findWikimediaCandidates } from '../wikimedia';
import { findInlineCandidates as findPixabayCandidates } from '../pixabay';
import { findInlineCandidates as findPexelsCandidates } from '../pexels';
import { findInlineCandidates as findUnsplashInlineCandidates } from '../unsplash/inline';

describe('inline-images orchestrator', () => {
  beforeEach(() => {
    (findFreepik as unknown as vi.Mock).mockReset();
    (findWikimedia as unknown as vi.Mock).mockReset();
    (downloadAndSave as unknown as vi.Mock).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  const freepikResult = {
    url: 'https://img.freepik.com/free-photo/x.jpg?size=1500&t=...',
    sourceName: 'Freepik',
    sourceUrl: 'https://www.freepik.com/free-photo/x_1.htm',
    altText: 'A trader looking at multiple monitors with charts',
    width: 626, height: 417,
    license: 'Freepik License',
    attribution: null,
    requiresAttribution: false,
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

  it('fetchInlineSource returns Freepik result when available (Freepik is primary)', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(freepikResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(freepikResult);
    expect(findWikimedia).not.toHaveBeenCalled();
  });

  it('fetchInlineSource falls back to Wikimedia when Freepik returns null', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(wikimediaResult);
  });

  it('fetchInlineSource returns null when both sources miss', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('q');
    expect(result).toBeNull();
  });

  it('fetchInlineSource retries both sources with a 3-word version when the full query misses', async () => {
    (findFreepik as unknown as vi.Mock)
      .mockResolvedValueOnce(null)         // full query: freepik miss
      .mockResolvedValueOnce(freepikResult); // 3-word query: freepik hit
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null); // full query: wikimedia miss

    const result = await fetchInlineSource('Bybit futures perpetual contract trading interface');

    expect(result).toEqual(freepikResult);
    expect((findFreepik as unknown as vi.Mock).mock.calls[0][0]).toBe('Bybit futures perpetual contract trading interface');
    expect((findFreepik as unknown as vi.Mock).mock.calls[1][0]).toBe('Bybit futures perpetual');
  });

  it('fetchInlineSource falls through to Wikimedia when Freepik throws (e.g. 401, network)', async () => {
    (findFreepik as unknown as vi.Mock).mockRejectedValueOnce(new Error('freepik 401'));
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(wikimediaResult);
    const result = await fetchInlineSource('q');
    expect(result).toEqual(wikimediaResult);
  });

  it('fetchInlineSource returns null when all sources throw', async () => {
    (findFreepik as unknown as vi.Mock).mockRejectedValueOnce(new Error('freepik down'));
    (findWikimedia as unknown as vi.Mock).mockRejectedValueOnce(new Error('wm down'));
    const result = await fetchInlineSource('q');
    expect(result).toBeNull();
  });

  it('fetchInlineSource does not retry a short (<=3 word) query', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await fetchInlineSource('ethereum ETH');
    expect(result).toBeNull();
    expect(findFreepik).toHaveBeenCalledTimes(1);
    expect(findWikimedia).toHaveBeenCalledTimes(1);
  });

  it('resolvePlaceholder produces a figure with caption only (no Freepik attribution suffix on paid plan)', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(freepikResult);
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
    expect(result?.figureHtml).toContain('<figcaption>Bybit interface</figcaption>');
    // No author, no source link, no license string when requiresAttribution=false.
    expect(result?.figureHtml).not.toContain('Freepik License');
    expect(result?.figureHtml).not.toContain('href="https://www.freepik.com');
    expect(downloadAndSave).toHaveBeenCalledWith(freepikResult.url, 'slug-inline-1', 800, 450);
  });

  it('resolvePlaceholder includes the artist name when attribution is present', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(null);
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
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(null);
    (findWikimedia as unknown as vi.Mock).mockResolvedValueOnce(null);
    const result = await resolvePlaceholder('q', 'c', 'stem');
    expect(result).toBeNull();
    expect(downloadAndSave).not.toHaveBeenCalled();
  });

  it('resolvePlaceholder HTML-escapes caption content', async () => {
    (findFreepik as unknown as vi.Mock).mockResolvedValueOnce(freepikResult);
    (downloadAndSave as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/s.jpg', filename: 's.jpg',
    });
    const result = await resolvePlaceholder('q', 'Hello "world" <evil>', 'stem');
    expect(result?.figureHtml).toContain('Hello &quot;world&quot; &lt;evil&gt;');
    expect(result?.figureHtml).not.toContain('<evil>');
  });
});

describe('fetchInlineCandidates', () => {
  beforeEach(() => {
    // Reset and default each source to [] so a test that doesn't set
    // a specific source's behavior doesn't crash when the orchestrator
    // calls it.
    for (const mock of [
      findFreepikCandidates, findWikimediaCandidates,
      findPixabayCandidates, findPexelsCandidates, findUnsplashInlineCandidates,
    ]) {
      (mock as unknown as vi.Mock).mockReset();
      (mock as unknown as vi.Mock).mockResolvedValue([]);
    }
  });

  it('concatenates freepik, wikimedia, pixabay, pexels, unsplash for the full query in that order', async () => {
    (findFreepikCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'F1', inlineSource: { url: 'fp/1' } as any },
    ]);
    (findWikimediaCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'https://commons/W1', inlineSource: { url: 'wm/1' } as any },
    ]);
    (findPixabayCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'PX1', inlineSource: { url: 'px/1' } as any },
    ]);
    (findPexelsCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'PE1', inlineSource: { url: 'pe/1' } as any },
    ]);
    (findUnsplashInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'U1', inlineSource: { url: 'un/1' } as any },
    ]);

    const out = await fetchInlineCandidates('short query');
    expect(out.map((c) => c.source)).toEqual(['freepik', 'wikimedia', 'pixabay', 'pexels', 'unsplash']);
    expect(out.map((c) => c.sourceId)).toEqual(['F1', 'https://commons/W1', 'PX1', 'PE1', 'U1']);
  });

  it('also tries 3-word fallback query when full query is long', async () => {
    (findFreepikCandidates as unknown as vi.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sourceId: 'F2', inlineSource: { url: 'fp/2' } as any }]);

    const out = await fetchInlineCandidates('Bybit futures perpetual contract trading interface');
    expect(out).toHaveLength(1);
    expect((findFreepikCandidates as unknown as vi.Mock).mock.calls[0][0])
      .toBe('Bybit futures perpetual contract trading interface');
    expect((findFreepikCandidates as unknown as vi.Mock).mock.calls[1][0])
      .toBe('Bybit futures perpetual');
    // Each source is called twice (once per variant)
    expect((findPixabayCandidates as unknown as vi.Mock)).toHaveBeenCalledTimes(2);
    expect((findPexelsCandidates as unknown as vi.Mock)).toHaveBeenCalledTimes(2);
    expect((findUnsplashInlineCandidates as unknown as vi.Mock)).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown source as empty (per-source isolation)', async () => {
    (findFreepikCandidates as unknown as vi.Mock).mockRejectedValueOnce(new Error('401'));
    (findWikimediaCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'W', inlineSource: { url: 'wm' } as any },
    ]);
    const out = await fetchInlineCandidates('q');
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('wikimedia');
  });

  it('one dead source does not block the others (e.g. freepik 429 → pixabay still contributes)', async () => {
    (findFreepikCandidates as unknown as vi.Mock).mockRejectedValueOnce(new Error('freepik 429'));
    (findPixabayCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'PX', inlineSource: { url: 'px' } as any },
    ]);
    (findPexelsCandidates as unknown as vi.Mock).mockResolvedValueOnce([
      { sourceId: 'PE', inlineSource: { url: 'pe' } as any },
    ]);
    const out = await fetchInlineCandidates('q');
    expect(out.map((c) => c.source)).toEqual(['pixabay', 'pexels']);
  });
});
