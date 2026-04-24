// src/stages/research-topic.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { researchTopic } from './research-topic';
import type { PerplexityBrief } from '../integrations/perplexity/types';

vi.mock('../integrations/perplexity', () => ({ researchKeyword: vi.fn() }));
import { researchKeyword } from '../integrations/perplexity';

function briefFor(keyword: string, wc: number = 1400): PerplexityBrief {
  return {
    keyword,
    search_intent: 'informational',
    target_audience: 'x',
    top_3_competitors: [
      { title: 'A', url: 'https://a.example', strengths: ['s'], weaknesses: ['w'], word_count: 1200, tone: 'neutral' },
      { title: 'B', url: 'https://b.example', strengths: ['s'], weaknesses: ['w'], word_count: 1400, tone: 'neutral' },
      { title: 'C', url: 'https://c.example', strengths: ['s'], weaknesses: ['w'], word_count: 1100, tone: 'neutral' },
    ],
    winning_angle: 'beat them',
    unique_hook: 'the hook',
    content_gaps: ['g1', 'g2', 'g3'],
    questions_to_answer: ['q1', 'q2', 'q3', 'q4', 'q5'],
    key_stats_to_include: ['stat1', 'stat2'],
    recommended_tone: 'direct',
    recommended_title: 'Great Title',
    recommended_h2s: ['h1', 'h2', 'h3', 'h4', 'h5'],
    key_terms_to_include: ['t1', 't2', 't3', 't4', 't5'],
    word_count_recommendation: wc,
    faq_questions: ['f1', 'f2', 'f3'],
  };
}

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
    (researchKeyword as unknown as vi.Mock).mockResolvedValueOnce(briefFor('bybit', 1400));

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
    (researchKeyword as unknown as vi.Mock).mockResolvedValueOnce(briefFor('k', 1200));
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
