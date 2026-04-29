import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('node:fs/promises', () => ({ default: { unlink: vi.fn() }, unlink: vi.fn() }));

import {
  searchHeroCandidates, downloadAndCrop, getFallbackImage,
} from '../integrations/unsplash';
import { isSourceIdUsed, isContentHashUsed, recordImageUsage } from '../db/queries';
import { pickUniqueHero } from './image-fetch';

const candA = { id: 'A', urlRaw: 'u/A', altText: '', photographerName: '', photographerUrl: '', width: 2000, height: 1500 };
const candB = { id: 'B', urlRaw: 'u/B', altText: '', photographerName: '', photographerUrl: '', width: 2000, height: 1500 };

const localA = { url: '/images/x-hero.jpg', altText: 't', width: 1200, height: 630, photographerName: '', photographerUrl: '', unsplashId: 'A', isFallback: false, contentHash: 'hashA' };
const localB = { ...localA, unsplashId: 'B', contentHash: 'hashB' };

beforeEach(() => {
  vi.clearAllMocks();
  (downloadAndCrop as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (photo: any) => {
    if (photo.id === 'A') return localA;
    return localB;
  });
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
      contentHash: 'hashA',
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
    (isContentHashUsed as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (h: string) => h === 'hashA');

    const out = await pickUniqueHero({
      category: 'indicators', articleId: 'art1', slug: 's', altText: 't', filenameStem: 's-hero',
    });

    expect(out.unsplashId).toBe('B');
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
