// src/stages/outline-article.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { outlineArticle } from './outline-article';

vi.mock('../integrations/claude', () => ({ generateOutline: vi.fn() }));
import { generateOutline } from '../integrations/claude';

describe('outlineArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (generateOutline as unknown as vi.Mock).mockReset();
  });
  afterAll(async () => { await closeDb(); });

  it('stores outline + title + slug + meta + secondary keywords, advances to outlined', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'bybit futures guide', category: 'exchanges', status: 'researched',
      perplexityBrief: {
        keyword: 'bybit futures guide',
        search_intent: 'informational',
        target_audience: 'traders',
        top_3_competitors: [
          { title: 'A', url: 'https://a', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
          { title: 'B', url: 'https://b', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
          { title: 'C', url: 'https://c', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
        ],
        winning_angle: 'wa', unique_hook: 'uh',
        content_gaps: [], questions_to_answer: [],
        key_stats_to_include: [], recommended_tone: 'direct',
        recommended_title: 'Bybit', recommended_h2s: [], key_terms_to_include: [],
        word_count_recommendation: 1400, faq_questions: [],
      },
    }).returning();

    (generateOutline as unknown as vi.Mock).mockResolvedValueOnce({
      title: 'Bybit Guide', slug: 'bybit-guide',
      meta_title: 'Bybit Guide', meta_description: 'Guide desc',
      primary_keyword: 'bybit futures guide',
      secondary_keywords: ['bybit perps', 'bybit leverage'],
      target_audience: 'traders', search_intent: 'informational', word_count: 1400,
      outline: { h1: 'Bybit Guide', introduction: '', sections: [], conclusion: '', faq: [] },
      internal_links: [], cta_placement: 'after risk', estimated_read_time: '7 min read',
    });

    await outlineArticle(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('outlined');
    expect(row.title).toBe('Bybit Guide');
    expect(row.slug).toBe('bybit-guide');
    expect(row.estimatedReadTime).toBe('7 min read');
    expect(Array.isArray(row.secondaryKeywords)).toBe(true);
  });

  it('throws when brief is missing', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'x', category: 'concepts', status: 'researched',
    }).returning();
    await expect(outlineArticle(a.id)).rejects.toThrow(/brief/i);
  });
});
