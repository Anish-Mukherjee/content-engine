// src/stages/drive-article.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { driveArticle } from './drive-article';

vi.mock('./research-topic', () => ({ researchTopic: vi.fn() }));
vi.mock('./outline-article', () => ({ outlineArticle: vi.fn() }));
vi.mock('./write-article', () => ({ writeArticle: vi.fn() }));
vi.mock('./fetch-image', () => ({ fetchImage: vi.fn() }));
vi.mock('./queue-article', () => ({ queueArticle: vi.fn() }));

import { researchTopic } from './research-topic';
import { outlineArticle } from './outline-article';
import { writeArticle } from './write-article';
import { fetchImage } from './fetch-image';
import { queueArticle } from './queue-article';

describe('driveArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    for (const m of [researchTopic, outlineArticle, writeArticle, fetchImage, queueArticle]) {
      (m as unknown as vi.Mock).mockReset();
    }
  });
  afterAll(async () => { await closeDb(); });

  it('runs the full chain for a pending article, advancing status between each stage', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'pending',
    }).returning();
    // Simulate each stage advancing the status in the DB
    (researchTopic as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'researched' }).where(eq(articles.id, id));
    });
    (outlineArticle as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'outlined' }).where(eq(articles.id, id));
    });
    (writeArticle as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'written' }).where(eq(articles.id, id));
    });
    (fetchImage as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'image_ready' }).where(eq(articles.id, id));
    });
    (queueArticle as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'scheduled' }).where(eq(articles.id, id));
    });

    await driveArticle();

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('scheduled');
    expect(researchTopic).toHaveBeenCalledWith(a.id);
    expect(outlineArticle).toHaveBeenCalledWith(a.id);
    expect(writeArticle).toHaveBeenCalledWith(a.id);
    expect(fetchImage).toHaveBeenCalledWith(a.id);
    expect(queueArticle).toHaveBeenCalledWith(a.id);
  });

  it('halts and marks *_failed when a stage throws', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'exchanges', status: 'pending',
    }).returning();
    (researchTopic as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'researched' }).where(eq(articles.id, id));
    });
    (outlineArticle as unknown as vi.Mock).mockImplementation(async (id: string) => {
      await db().update(articles).set({ status: 'outlined' }).where(eq(articles.id, id));
    });
    (writeArticle as unknown as vi.Mock).mockRejectedValueOnce(new Error('claude down'));

    await driveArticle();

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('write_failed');
    expect(row.retryCount).toBe(1);
    expect(row.lastError).toContain('claude down');
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('is a no-op when no article is drivable', async () => {
    await driveArticle();
    expect(researchTopic).not.toHaveBeenCalled();
  });
});
