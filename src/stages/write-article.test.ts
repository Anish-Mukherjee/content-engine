// src/stages/write-article.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { writeArticle } from './write-article';

vi.mock('../integrations/claude', () => ({ writeArticleBody: vi.fn() }));
import { writeArticleBody } from '../integrations/claude';

const OUTLINE_JSON = {
  title: 'T', slug: 't', meta_title: 'T', meta_description: 'D',
  primary_keyword: 'k', secondary_keywords: ['k2'],
  target_audience: 'x', search_intent: 'informational', word_count: 1200,
  outline: { h1: 'T', introduction: '', sections: [], conclusion: '', faq: [] },
  internal_links: [], cta_placement: 'end', estimated_read_time: '5 min read',
};
const BRIEF = {
  keyword: 'k', search_intent: 'informational', target_audience: '',
  top_questions: [], trending_angles: [], content_gaps: [],
  recent_developments: [], competitor_titles: [],
  recommended_title: '', recommended_h2s: [], key_terms_to_include: [],
  word_count_recommendation: 1200,
};

describe('writeArticle', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE articles CASCADE`);
    (writeArticleBody as unknown as vi.Mock).mockReset();
  });
  afterAll(async () => { await closeDb(); });

  it('stores sanitized HTML + word count, advances to written', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'outlined',
      outline: OUTLINE_JSON, perplexityBrief: BRIEF,
      secondaryKeywords: ['k2'],
    }).returning();

    const longBody = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    (writeArticleBody as unknown as vi.Mock).mockResolvedValueOnce(
      `<h1>Hello</h1><p>${longBody}</p><script>bad()</script>`,
    );

    await writeArticle(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('written');
    expect(row.articleHtml).toContain('<h1>Hello</h1>');
    expect(row.articleHtml).not.toContain('<script');
    expect(row.wordCount).toBeGreaterThanOrEqual(200);
    expect(row.faqSchema).toBeDefined();
  });

  it('throws TerminalError if output is under 200 words', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'outlined',
      outline: OUTLINE_JSON, perplexityBrief: BRIEF,
    }).returning();
    (writeArticleBody as unknown as vi.Mock).mockResolvedValueOnce('<h1>Hi</h1><p>tiny</p>');
    await expect(writeArticle(a.id)).rejects.toThrow(/too short/i);
  });

  it('extracts FAQ schema when FAQ items present', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'outlined',
      outline: OUTLINE_JSON, perplexityBrief: BRIEF,
    }).returning();

    const body = [
      '<h1>T</h1>',
      '<p>' + 'word '.repeat(300).trim() + '</p>',
      '<div class="faq-section">',
      '<div class="faq-item"><div class="faq-question">Q?</div><div class="faq-answer"><p>A.</p></div></div>',
      '</div>',
    ].join('');
    (writeArticleBody as unknown as vi.Mock).mockResolvedValueOnce(body);

    await writeArticle(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    const schema = row.faqSchema as { '@type': string; mainEntity: unknown[] };
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(1);
  });
});
