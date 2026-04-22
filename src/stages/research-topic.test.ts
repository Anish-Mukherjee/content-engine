// src/stages/research-topic.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { researchTopic } from './research-topic';

vi.mock('../integrations/perplexity', () => ({ researchKeyword: vi.fn() }));
import { researchKeyword } from '../integrations/perplexity';

describe('researchTopic', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (researchKeyword as unknown as vi.Mock).mockReset();
  });
  afterAll(async () => { await closeDb(); });

  it('advances pending to researched with brief JSON', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'bybit', category: 'exchanges', status: 'pending',
    }).returning();
    (researchKeyword as unknown as vi.Mock).mockResolvedValueOnce({
      keyword: 'bybit', search_intent: 'informational', target_audience: 'x',
      top_questions: [], trending_angles: [], content_gaps: [],
      recent_developments: [], competitor_titles: [],
      recommended_title: '', recommended_h2s: [], key_terms_to_include: [],
      word_count_recommendation: 1400,
    });

    await researchTopic(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('researched');
    expect(row.perplexityBrief).toBeDefined();
    expect(row.researchedAt).toBeDefined();
  });

  it('advances researching status if already transitioning (re-entrant)', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'researching',
    }).returning();
    (researchKeyword as unknown as vi.Mock).mockResolvedValueOnce({
      keyword: 'k', search_intent: 'x', target_audience: '',
      top_questions: [], trending_angles: [], content_gaps: [],
      recent_developments: [], competitor_titles: [],
      recommended_title: '', recommended_h2s: [], key_terms_to_include: [],
      word_count_recommendation: 1200,
    });
    await researchTopic(a.id);
    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('researched');
  });

  it('propagates integration errors (driver handles)', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'pending',
    }).returning();
    (researchKeyword as unknown as vi.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(researchTopic(a.id)).rejects.toThrow('boom');
  });
});
