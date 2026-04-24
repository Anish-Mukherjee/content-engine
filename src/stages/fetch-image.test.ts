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
vi.mock('../integrations/inline-images', () => ({
  resolvePlaceholder: vi.fn(),
}));

import { searchHeroImage, downloadAndCrop, getFallbackImage } from '../integrations/unsplash';
import { resolvePlaceholder } from '../integrations/inline-images';

const HERO = {
  url: '/images/post-1-hero.jpg', altText: 'alt', width: 1200, height: 630,
  photographerName: 'J', photographerUrl: 'https://u/@j', unsplashId: 'abc', isFallback: false,
};
const FALLBACK = {
  url: '/images/fallbacks/exchanges.jpg', altText: '', width: 1200, height: 630,
  photographerName: null, photographerUrl: null, unsplashId: null, isFallback: true,
};

describe('fetchImage', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (searchHeroImage as unknown as vi.Mock).mockReset();
    (downloadAndCrop as unknown as vi.Mock).mockReset();
    (getFallbackImage as unknown as vi.Mock).mockReset();
    (resolvePlaceholder as unknown as vi.Mock).mockReset();
  });
  afterAll(async () => { await closeDb(); });

  it('fetches hero, leaves articleHtml untouched when no placeholders, advances to image_ready', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-1',
      articleHtml: '<h2>Heading</h2><p>body</p>',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce({
      id: 'abc', urlRaw: 'https://u/raw.jpg', altText: 'alt',
      photographerName: 'J', photographerUrl: 'https://u/@j',
      width: 4000, height: 3000,
    });
    (downloadAndCrop as unknown as vi.Mock).mockResolvedValueOnce(HERO);

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    const hero = row.heroImage as { url: string; isFallback: boolean };
    expect(hero.url).toBe('/images/post-1-hero.jpg');
    expect(hero.isFallback).toBe(false);
    expect(resolvePlaceholder).not.toHaveBeenCalled();
  });

  it('replaces inline image placeholders with <figure> HTML', async () => {
    const html =
      '<h2>H</h2><p>intro</p>' +
      '<div class="inline-image-placeholder" data-query="bybit interface" data-caption="Bybit interface"></div>' +
      '<p>more</p>';
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-2',
      articleHtml: html,
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce({
      id: 'abc', urlRaw: 'https://u/raw.jpg', altText: '',
      photographerName: 'J', photographerUrl: 'https://u/@j',
      width: 4000, height: 3000,
    });
    (downloadAndCrop as unknown as vi.Mock).mockResolvedValueOnce(HERO);
    (resolvePlaceholder as unknown as vi.Mock).mockResolvedValueOnce({
      figureHtml: '<figure class="article-image"><img src="https://cdn.example/inline.jpg" alt="Bybit interface" width="800" height="450" loading="lazy" /><figcaption>Bybit interface — <a href="https://example.com" target="_blank" rel="noopener noreferrer">example.com</a> (Creative Commons)</figcaption></figure>',
      localUrl: '/images/post-2-inline-1.jpg',
      source: { url: 'x', sourceName: 'example.com', sourceUrl: 'https://example.com', altText: '', width: 800, height: 450, license: 'CC', attribution: null, requiresAttribution: true },
    });

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    expect(row.articleHtml).toContain('<figure class="article-image">');
    expect(row.articleHtml).toContain('src="https://cdn.example/inline.jpg"');
    expect(row.articleHtml).not.toContain('inline-image-placeholder');
    expect(resolvePlaceholder).toHaveBeenCalledWith('bybit interface', 'Bybit interface', 'post-2-inline-1');
  });

  it('strips placeholder when no inline image source is found (both Google and Wikimedia miss)', async () => {
    const html =
      '<h2>H</h2><p>intro</p>' +
      '<div class="inline-image-placeholder" data-query="no-results" data-caption="x"></div>' +
      '<p>outro</p>';
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-3',
      articleHtml: html,
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce({
      id: 'abc', urlRaw: 'https://u/raw.jpg', altText: '',
      photographerName: 'J', photographerUrl: 'https://u/@j', width: 4000, height: 3000,
    });
    (downloadAndCrop as unknown as vi.Mock).mockResolvedValueOnce(HERO);
    (resolvePlaceholder as unknown as vi.Mock).mockResolvedValueOnce(null);

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    expect(row.articleHtml).not.toContain('inline-image-placeholder');
    expect(row.articleHtml).toContain('<p>intro</p>');
    expect(row.articleHtml).toContain('<p>outro</p>');
  });

  it('strips placeholder when the resolver throws — never blocks pipeline', async () => {
    const html =
      '<h2>H</h2><p>i</p>' +
      '<div class="inline-image-placeholder" data-query="q" data-caption="c"></div>';
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-4',
      articleHtml: html,
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce(null);
    (getFallbackImage as unknown as vi.Mock).mockReturnValueOnce(FALLBACK);
    (resolvePlaceholder as unknown as vi.Mock).mockRejectedValueOnce(new Error('boom'));

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    expect(row.articleHtml).not.toContain('inline-image-placeholder');
  });

  it('falls back when Unsplash returns null', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-5',
      articleHtml: '<p>no placeholders</p>',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockResolvedValueOnce(null);
    (getFallbackImage as unknown as vi.Mock).mockReturnValueOnce(FALLBACK);

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
    const hero = row.heroImage as { isFallback: boolean };
    expect(hero.isFallback).toBe(true);
  });

  it('falls back on hero integration error — never blocks pipeline', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'post-6',
      articleHtml: '<p>x</p>',
    }).returning();
    (searchHeroImage as unknown as vi.Mock).mockRejectedValueOnce(new Error('unsplash down'));
    (getFallbackImage as unknown as vi.Mock).mockReturnValueOnce(FALLBACK);

    await fetchImage(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('image_ready');
  });
});
