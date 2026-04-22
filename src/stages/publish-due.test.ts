// src/stages/publish-due.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { publishDue } from './publish-due';

vi.mock('../integrations/frontend', () => ({ revalidate: vi.fn() }));
vi.mock('../integrations/google-indexing', () => ({ submitUrl: vi.fn() }));
import { revalidate } from '../integrations/frontend';
import { submitUrl } from '../integrations/google-indexing';

describe('publishDue', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (revalidate as unknown as vi.Mock).mockReset().mockResolvedValue(undefined);
    (submitUrl as unknown as vi.Mock).mockReset().mockResolvedValue(undefined);
    process.env.FRONTEND_BASE_URL = 'https://xerogravity.com';
  });
  afterAll(async () => { await closeDb(); });

  it('publishes articles whose scheduledAt <= now', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'x', status: 'scheduled', slug: 'post-1', scheduledAt: past,
    }).returning();

    await publishDue();

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('published');
    expect(row.publishedAt).toBeDefined();
    expect(revalidate).toHaveBeenCalledWith(['/blog/post-1', '/blog', '/']);
    expect(submitUrl).toHaveBeenCalledWith('https://xerogravity.com/blog/post-1', 'URL_UPDATED');
  });

  it('leaves future-scheduled articles untouched', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'x', status: 'scheduled', slug: 'future', scheduledAt: future,
    }).returning();

    await publishDue();

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('scheduled');
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('still marks published when revalidate fails (soft-fail behaviour)', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'x', status: 'scheduled', slug: 'post-2', scheduledAt: past,
    }).returning();
    // Even if revalidate throws, publishDue should not rollback
    (revalidate as unknown as vi.Mock).mockRejectedValueOnce(new Error('5xx'));

    await publishDue();

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('published');
  });
});
