// src/db/queries.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './client';
import { articles } from './schema';
import { pickNextDrivable, getArticle, markFailed } from './queries';

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
