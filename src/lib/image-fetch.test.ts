import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../integrations/inline-images', () => ({
  fetchInlineCandidates: vi.fn(),
  renderInlineFigure: vi.fn(({ localUrl }: any) => `<figure><img src="${localUrl}"/></figure>`),
}));
vi.mock('../integrations/inline-images/download', () => ({
  downloadAndSave: vi.fn(),
}));

vi.mock('../integrations/unsplash', () => ({
  searchHeroCandidates: vi.fn(),
  downloadAndCrop: vi.fn(),
  getFallbackImage: vi.fn(),
}));
vi.mock('../db/queries', () => ({
  isSourceIdUsed: vi.fn(),
  isContentHashUsed: vi.fn(),
  recordImageUsage: vi.fn(),
}));
vi.mock('node:fs', () => ({
  promises: { unlink: vi.fn() },
}));

import {
  searchHeroCandidates, downloadAndCrop, getFallbackImage,
} from '../integrations/unsplash';
import { isSourceIdUsed, isContentHashUsed, recordImageUsage } from '../db/queries';
import { promises as fs } from 'node:fs';
import { pickUniqueHero } from './image-fetch';

import { pickUniqueInline } from './image-fetch';
import { fetchInlineCandidates } from '../integrations/inline-images';
import { downloadAndSave } from '../integrations/inline-images/download';

const fpCand = (id: string) => ({
  source: 'freepik' as const,
  sourceId: id,
  inlineSource: {
    url: `https://fp/${id}`, sourceName: 'Freepik', sourceUrl: '',
    altText: '', width: 800, height: 450,
    license: 'Freepik License', attribution: null, requiresAttribution: false,
  },
});

const wmCand = (id: string) => ({
  source: 'wikimedia' as const,
  sourceId: id,
  inlineSource: {
    url: `https://wm/${id}`, sourceName: 'Wikimedia Commons', sourceUrl: id,
    altText: '', width: 800, height: 450,
    license: 'CC BY-SA 4.0', attribution: 'Jane', requiresAttribution: true,
  },
});

const candA = { id: 'A', urlRaw: 'u/A', altText: '', photographerName: '', photographerUrl: '', width: 2000, height: 1500 };
const candB = { id: 'B', urlRaw: 'u/B', altText: '', photographerName: '', photographerUrl: '', width: 2000, height: 1500 };

const localA = { url: '/images/x-hero.jpg', altText: 't', width: 1200, height: 630, photographerName: '', photographerUrl: '', unsplashId: 'A', isFallback: false, contentHash: 'abcdef0123456789' };
const localB = { ...localA, unsplashId: 'B', contentHash: 'fedcba9876543210' };

beforeEach(() => {
  vi.clearAllMocks();
  (downloadAndCrop as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (photo: any) => {
    if (photo.id === 'A') return localA;
    return localB;
  });
  (downloadAndSave as unknown as vi.Mock).mockImplementation(async (_url: string, stem: string) => ({
    url: `/images/${stem}.jpg`,
    filename: `${stem}.jpg`,
    contentHash: 'cafebabe12345678',
    bytes: Buffer.from(''),
  }));
});

describe('pickUniqueHero', () => {
  it('returns first candidate when nothing is used', async () => {
    (searchHeroCandidates as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([candA, candB]);
    (isSourceIdUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isContentHashUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });

    expect(out.unsplashId).toBe('A');
    expect(recordImageUsage).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'art1', role: 'hero', position: null, source: 'unsplash', sourceId: 'A',
      contentHash: 'abcdef0123456789',
    }));
  });

  it('skips candidate whose source id is already used, takes next', async () => {
    (searchHeroCandidates as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([candA, candB]);
    (isSourceIdUsed as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_s: string, id: string) => id === 'A');
    (isContentHashUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });

    expect(out.unsplashId).toBe('B');
  });

  it('skips candidate whose content hash is already used, takes next', async () => {
    (searchHeroCandidates as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([candA, candB]);
    (isSourceIdUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isContentHashUsed as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (h: string) => h === 'abcdef0123456789');

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });

    expect(out.unsplashId).toBe('B');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('s-hero.jpg'));
  });

  it('exhausts primary, tries widened query, then falls back to category fallback', async () => {
    (searchHeroCandidates as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([candA])
      .mockResolvedValueOnce([candB]);
    (isSourceIdUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isContentHashUsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const fallback = { url: '/images/fallbacks/indicators.jpg', altText: 't', width: 1200, height: 630, photographerName: null, photographerUrl: null, unsplashId: null, isFallback: true };
    (getFallbackImage as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(fallback);

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });

    expect(out).toEqual(fallback);
    expect(searchHeroCandidates).toHaveBeenCalledTimes(2);
    expect(searchHeroCandidates).toHaveBeenNthCalledWith(2, 'indicators', { wide: true });
    expect(recordImageUsage).not.toHaveBeenCalled();
  });
});

describe('pickUniqueInline', () => {
  it('saves first non-duplicate candidate and registers it', async () => {
    (fetchInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([fpCand('1'), fpCand('2')]);
    (isSourceIdUsed as unknown as vi.Mock).mockResolvedValue(false);
    (isContentHashUsed as unknown as vi.Mock).mockResolvedValue(false);

    const out = await pickUniqueInline({
      query: 'q', caption: 'c', articleId: 'art', position: 1, filenameStem: 's-inline-1',
    });

    expect(out).not.toBeNull();
    expect(out!.localUrl).toContain('/images/s-inline-1.jpg');
    expect(out!.localUrl).toMatch(/\?v=[a-f0-9]{8}$/);
    expect(recordImageUsage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'inline', position: 1, source: 'freepik', sourceId: '1',
    }));
  });

  it('skips source-id dupe and tries next', async () => {
    (fetchInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([fpCand('1'), wmCand('https://commons/W')]);
    (isSourceIdUsed as unknown as vi.Mock).mockImplementation(async (s: string, id: string) => s === 'freepik' && id === '1');
    (isContentHashUsed as unknown as vi.Mock).mockResolvedValue(false);

    const out = await pickUniqueInline({
      query: 'q', caption: 'c', articleId: 'art', position: 2, filenameStem: 's-inline-2',
    });

    expect(out!.source.sourceName).toBe('Wikimedia Commons');
    expect(recordImageUsage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'wikimedia', sourceId: 'https://commons/W',
    }));
  });

  it('skips content-hash dupe (intra-article), tries next', async () => {
    (fetchInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([fpCand('1'), fpCand('2')]);
    (isSourceIdUsed as unknown as vi.Mock).mockResolvedValue(false);
    (isContentHashUsed as unknown as vi.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const out = await pickUniqueInline({
      query: 'q', caption: 'c', articleId: 'art', position: 1, filenameStem: 's-inline-1',
    });

    expect(out).not.toBeNull();
  });

  it('returns null when every candidate exhausts', async () => {
    (fetchInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([fpCand('1')]);
    (isSourceIdUsed as unknown as vi.Mock).mockResolvedValue(true);

    const out = await pickUniqueInline({
      query: 'q', caption: 'c', articleId: 'art', position: 1, filenameStem: 's-inline-1',
    });
    expect(out).toBeNull();
  });

  it('forwards category to fetchInlineCandidates so per-category routing fires', async () => {
    (fetchInlineCandidates as unknown as vi.Mock).mockResolvedValueOnce([fpCand('1')]);
    (isSourceIdUsed as unknown as vi.Mock).mockResolvedValue(false);
    (isContentHashUsed as unknown as vi.Mock).mockResolvedValue(false);

    await pickUniqueInline({
      query: 'Bybit interface', caption: 'c', articleId: 'art',
      position: 1, filenameStem: 's-inline-1', category: 'exchanges',
    });
    expect(fetchInlineCandidates).toHaveBeenCalledWith('Bybit interface', 'exchanges');
  });
});

import { versionedImageUrl } from './paths';
import { renderInlineFigure } from '../integrations/inline-images';

describe('versionedImageUrl', () => {
  it('appends ?v= with first 8 hex chars of hash', () => {
    expect(versionedImageUrl('/images/foo.jpg', 'abcdef0123456789'))
      .toBe('/images/foo.jpg?v=abcdef01');
  });

  it('uses & when URL already has a query string', () => {
    expect(versionedImageUrl('/images/foo.jpg?w=100', 'abcdef0123456789'))
      .toBe('/images/foo.jpg?w=100&v=abcdef01');
  });

  it('strips an existing v= param (idempotent)', () => {
    expect(versionedImageUrl('/images/foo.jpg?v=oldhash', 'newhash00112233'))
      .toBe('/images/foo.jpg?v=newhash0');
  });

  it('passes through unchanged when contentHash is empty', () => {
    expect(versionedImageUrl('/images/foo.jpg', '')).toBe('/images/foo.jpg');
  });
});

describe('pickUniqueHero versions the returned URL', () => {
  it('returned LocalImage.url has ?v=<hash[:8]> appended', async () => {
    (searchHeroCandidates as unknown as Mock).mockResolvedValueOnce([candA]);
    (isSourceIdUsed as unknown as Mock).mockResolvedValue(false);
    (isContentHashUsed as unknown as Mock).mockResolvedValue(false);

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });
    expect(out.url).toMatch(/\?v=[a-f0-9]{8}$/);
    expect(out.url).toContain('/images/x-hero.jpg');
  });
});

describe('pickUniqueInline versions the rendered figure URL', () => {
  it('renderInlineFigure receives a versioned localUrl, and result.localUrl is versioned', async () => {
    (fetchInlineCandidates as unknown as Mock).mockResolvedValueOnce([fpCand('1')]);
    (isSourceIdUsed as unknown as Mock).mockResolvedValue(false);
    (isContentHashUsed as unknown as Mock).mockResolvedValue(false);

    const out = await pickUniqueInline({
      query: 'q', caption: 'c', articleId: 'art', position: 1, filenameStem: 's-inline-1',
    });
    expect(out!.localUrl).toMatch(/\?v=[a-f0-9]{8}$/);
    expect(out!.localUrl).toContain('/images/s-inline-1.jpg');
    // renderInlineFigure mock receives versioned URL
    const renderCalls = (renderInlineFigure as unknown as Mock).mock.calls;
    expect(renderCalls[0][0].localUrl).toMatch(/\?v=[a-f0-9]{8}$/);
  });
});
