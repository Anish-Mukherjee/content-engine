// src/stages/fetch-image.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { fetchImage } from './fetch-image';

vi.mock('../integrations/unsplash', () => ({
  searchHeroImage: vi.fn(),
  downloadAndCrop: vi.fn(),
  getFallbackImage: vi.fn(),
}));
import { searchHeroImage, downloadAndCrop, getFallbackImage } from '../integrations/unsplash';

describe('fetchImage', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (searchHeroImage as unknown as vi.Mock).mockReset();
    (downloadAndCrop as unknown as vi.Mock).mockReset();
    (getFallbackImage as unknown as vi.Mock).mockReset();
  });
  afterAll(async () => { await closeDb(); });

  it('fetches Unsplash image and advances to image_ready', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-1',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce({
      id: 'abc', urlRaw: 'https://u/raw.jpg', altText: 'alt',
      photographerName: 'J', photographerUrl: 'https://u/@j',
      width: 4000, height: 3000,
    });
    (downloadAndCrop as unknown as vi.Mock).mockResolvedValueOnce({
      url: '/images/post-1-hero.jpg', altText: 'alt', width: 1200, height: 630,
      photographerName: 'J', photographerUrl: 'https://u/@j', unsplashId: 'abc', isFallback: false,
    });

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    const hero = row.heroImage as { url: string; isFallback: boolean };
    expect(hero.url).toBe('/images/post-1-hero.jpg');
    expect(hero.isFallback).toBe(false);
  });

  it('falls back when Unsplash returns null', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-2',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce(null);
    (getFallbackImage as unknown as vi.Mock).mockReturnValueOnce({
      url: '/images/fallbacks/exchanges.jpg', altText: '', width: 1200, height: 630,
      photographerName: null, photographerUrl: null, unsplashId: null, isFallback: true,
    });

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    const hero = row.heroImage as { isFallback: boolean };
    expect(hero.isFallback).toBe(true);
  });

  it('falls back on integration error — never blocks pipeline', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-3',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockRejectedValueOnce(new Error('unsplash down'));
    (getFallbackImage as unknown as vi.Mock).mockReturnValueOnce({
      url: '/images/fallbacks/exchanges.jpg', altText: '', width: 1200, height: 630,
      photographerName: null, photographerUrl: null, unsplashId: null, isFallback: true,
    });

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
  });
});
