// src/server/routes/articles.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../../db/client';
import { articles } from '../../db/schema';
import { createApp } from '../app';

describe('articles routes', () => {
  const app = createApp();

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
  });
  afterAll(async () => { await closeDb(); });

  it('GET /api/articles returns only published rows', async () => {
    await db().insert(articles).values([
      { keyword: 'a', category: 'exchanges', status: 'published', slug: 'a',
        title: 'A', metaDescription: 'da', publishedAt: new Date('2099-01-01') },
      { keyword: 'b', category: 'exchanges', status: 'written', slug: 'b',
        title: 'B', metaDescription: 'db' },
    ]);
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].slug).toBe('a');
    expect(res.body.articles[0].retryCount).toBeUndefined();  // internal field stripped
  });

  it('GET /api/articles/:slug returns a published article', async () => {
    await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'published', slug: 'post-1',
      title: 'T', metaTitle: 'MT', metaDescription: 'MD',
      articleHtml: '<h1>X</h1>', faqSchema: { x: 1 },
      heroImage: { url: '/images/post-1-hero.jpg', isFallback: false },
      publishedAt: new Date(),
    });
    const res = await request(app).get('/api/articles/post-1');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('post-1');
    expect(res.body.articleHtml).toContain('<h1>X</h1>');
    expect(res.body.perplexityBrief).toBeUndefined();  // internal stripped
    expect(res.body.retryCount).toBeUndefined();
  });

  it('GET /api/articles/:slug returns 404 when unpublished or missing', async () => {
    await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'written', slug: 'not-yet',
    });
    expect((await request(app).get('/api/articles/not-yet')).status).toBe(404);
    expect((await request(app).get('/api/articles/nope')).status).toBe(404);
  });

  it('GET /api/articles?category= filters by category and ignores invalid values', async () => {
    await db().insert(articles).values([
      { keyword: 'a', category: 'exchanges', status: 'published', slug: 'a', publishedAt: new Date() },
      { keyword: 'b', category: 'funding-rates', status: 'published', slug: 'b', publishedAt: new Date() },
    ]);
    const valid = await request(app).get('/api/articles?category=exchanges');
    expect(valid.status).toBe(200);
    expect(valid.body.articles).toHaveLength(1);
    expect(valid.body.articles[0].slug).toBe('a');

    const invalid = await request(app).get('/api/articles?category=not-a-category');
    expect(invalid.status).toBe(200);
    expect(invalid.body.articles).toHaveLength(2);  // falls back to all published
  });

  it('GET /api/articles with non-numeric pagination params returns 200 with defaults', async () => {
    const res = await request(app).get('/api/articles?page=foo&limit=bar');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('GET /api/sitemap-data returns slug + publishedAt + updatedAt', async () => {
    await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'published', slug: 's',
      publishedAt: new Date('2099-05-01'),
    });
    const res = await request(app).get('/api/sitemap-data');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0]).toHaveProperty('slug');
    expect(res.body.articles[0]).toHaveProperty('updatedAt');
    expect(res.body.articles[0]).toHaveProperty('publishedAt');
  });

  it('GET /api/articles returns total reflecting all matching rows (not just current page)', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      keyword: `kw-${i}`, category: 'exchanges' as const, status: 'published' as const,
      slug: `s-${i}`, title: `T${i}`, metaDescription: `MD${i}`,
      publishedAt: new Date(2099, 0, i + 1),
    }));
    await db().insert(articles).values(rows);

    const res = await request(app).get('/api/articles?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(10);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
  });

  it('GET /api/articles?category=X returns total scoped to that category', async () => {
    await db().insert(articles).values([
      { keyword: 'a', category: 'exchanges', status: 'published', slug: 'a', publishedAt: new Date() },
      { keyword: 'b', category: 'patterns',  status: 'published', slug: 'b', publishedAt: new Date() },
      { keyword: 'c', category: 'patterns',  status: 'published', slug: 'c', publishedAt: new Date() },
    ]);
    const res = await request(app).get('/api/articles?category=patterns');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.articles).toHaveLength(2);
  });
});
