// src/db/queries.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './client';
import { articles } from './schema';
import { pickNextDrivable, getArticle, markFailed } from './queries';
import { isSourceIdUsed, isContentHashUsed, recordImageUsage, clearImageUsageForArticle } from './queries';
import { imageUsage } from './schema';

async function truncate() {
  await db().execute(sql`TRUNCATE TABLE articles, keyword_results, dataforseo_tasks, seed_keywords RESTART IDENTITY CASCADE`);
}

describe('queries', () => {
  beforeEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('pickNextDrivable returns oldest pending when no failed', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'a', category: 'exchanges', status: 'pending',
    }).returning();
    const [b] = await db().insert(articles).values({
      keyword: 'b', category: 'exchanges', status: 'pending',
    }).returning();

    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(a.id);
  });

  it('pickNextDrivable prefers retryable failed over pending', async () => {
    const [pending] = await db().insert(articles).values({
      keyword: 'p', category: 'exchanges', status: 'pending',
    }).returning();
    const [failed] = await db().insert(articles).values({
      keyword: 'f', category: 'exchanges', status: 'write_failed', retryCount: 1,
    }).returning();

    const picked = await pickNextDrivable();
    expect(picked?.id).toBe(failed.id);
  });

  it('pickNextDrivable skips failed with retryCount >= 3', async () => {
    await db().insert(articles).values({
      keyword: 'exhausted', category: 'exchanges', status: 'write_failed', retryCount: 3,
    });
    const picked = await pickNextDrivable();
    expect(picked).toBeUndefined();
  });

  it('markFailed sets status, increments retryCount, records lastError', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'x', category: 'exchanges', status: 'writing',
    }).returning();
    await markFailed(a.id, 'write_failed', new Error('boom'));
    const after = await getArticle(a.id);
    expect(after?.status).toBe('write_failed');
    expect(after?.retryCount).toBe(1);
    expect(after?.lastError).toContain('boom');
  });
});

describe('image_usage helpers', () => {
  let articleId: string;
  beforeEach(async () => {
    await db().delete(imageUsage);
    await db().delete(articles);
    const [row] = await db().insert(articles).values({
      keyword: 'k', category: 'indicators', status: 'pending',
    }).returning({ id: articles.id });
    articleId = row.id;
  });

  it('isSourceIdUsed returns false for unknown ids', async () => {
    expect(await isSourceIdUsed('unsplash', 'photo-X')).toBe(false);
  });

  it('isSourceIdUsed returns true after recording', async () => {
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/x-hero.jpg', source: 'unsplash', sourceId: 'photo-X',
      contentHash: 'abc',
    });
    expect(await isSourceIdUsed('unsplash', 'photo-X')).toBe(true);
  });

  it('isSourceIdUsed scoped by source', async () => {
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/x.jpg', source: 'unsplash', sourceId: 'collide',
      contentHash: 'h1',
    });
    expect(await isSourceIdUsed('freepik', 'collide')).toBe(false);
  });

  it('isContentHashUsed returns true after recording', async () => {
    await recordImageUsage({
      articleId, role: 'inline', position: 1,
      url: '/images/x-inline-1.jpg', source: 'freepik', sourceId: '12345',
      contentHash: 'sha256-abc',
    });
    expect(await isContentHashUsed('sha256-abc')).toBe(true);
    expect(await isContentHashUsed('different')).toBe(false);
  });

  it('clearImageUsageForArticle removes only that articles rows', async () => {
    const [other] = await db().insert(articles).values({
      keyword: 'k2', category: 'indicators', status: 'pending',
    }).returning({ id: articles.id });
    await recordImageUsage({
      articleId, role: 'hero', position: null,
      url: '/images/a-hero.jpg', source: 'unsplash', sourceId: 'A',
      contentHash: 'hA',
    });
    await recordImageUsage({
      articleId: other.id, role: 'hero', position: null,
      url: '/images/b-hero.jpg', source: 'unsplash', sourceId: 'B',
      contentHash: 'hB',
    });
    await clearImageUsageForArticle(articleId);
    expect(await isContentHashUsed('hA')).toBe(false);
    expect(await isContentHashUsed('hB')).toBe(true);
  });
});
