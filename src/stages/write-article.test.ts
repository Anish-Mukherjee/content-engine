// src/stages/write-article.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { db, closeDb } from '../db/client';
import { articles } from '../db/schema';
import { writeArticle } from './write-article';
import type { PerplexityBrief } from '../integrations/perplexity/types';

vi.mock('../integrations/claude', () => ({ writeArticleBody: vi.fn() }));
import { writeArticleBody } from '../integrations/claude';

const OUTLINE_JSON = {
  title: 'T', slug: 't', meta_title: 'T', meta_description: 'D',
  primary_keyword: 'k', secondary_keywords: ['k2'],
  target_audience: 'x', search_intent: 'informational', word_count: 1400,
  outline: { h1: 'T', introduction: '', sections: [], conclusion: '', faq: [] },
  internal_links: [], cta_placement: 'end', estimated_read_time: '7 min read',
};

const BRIEF: PerplexityBrief = {
  keyword: 'k',
  search_intent: 'informational',
  target_audience: 'x',
  top_3_competitors: [
    { title: 'A', url: 'https://a', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
    { title: 'B', url: 'https://b', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
    { title: 'C', url: 'https://c', strengths: [], weaknesses: [], word_count: 1200, tone: 'neutral' },
  ],
  winning_angle: 'wa', unique_hook: 'uh',
  content_gaps: [], questions_to_answer: [],
  key_stats_to_include: [], recommended_tone: 'direct',
  recommended_title: 'T', recommended_h2s: [], key_terms_to_include: [],
  word_count_recommendation: 1400, faq_questions: [],
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

    const longBody = Array.from({ length: 1100 }, (_, i) => `word${i}`).join(' ');
    // Body intentionally starts with an <h1> — the sanitizer must strip it so the
    // frame's <h1>{article.title}</h1> stays the sole H1 on the rendered page.
    (writeArticleBody as unknown as vi.Mock).mockResolvedValueOnce(
      `<h1>Duplicate title</h1><h2>Real heading</h2><p>${longBody}</p>` +
      `<div class="faq-section"><div class="faq-item"><div class="faq-question">Q?</div><div class="faq-answer"><p>A.</p></div></div></div>` +
      `<script>bad()</script>`,
    );

    await writeArticle(a.id);

    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.status).toBe('written');
    expect(row.articleHtml).not.toContain('<h1');
    expect(row.articleHtml).not.toContain('Duplicate title');
    expect(row.articleHtml).toContain('<h2>Real heading</h2>');
    expect(row.articleHtml).not.toContain('<script');
    expect(row.wordCount).toBeGreaterThanOrEqual(1000);
    expect(row.faqSchema).toBeDefined();
  });

  it('preserves inline image placeholders through sanitization so Phase-4 can replace them', async () => {
    const [a] = await db().insert(articles).values({
      keyword: 'k', category: 'concepts', status: 'outlined',
      outline: OUTLINE_JSON, perplexityBrief: BRIEF,
      secondaryKeywords: [],
    }).returning();

    const longBody = Array.from({ length: 1100 }, (_, i) => `w${i}`).join(' ');
    (writeArticleBody as unknown as vi.Mock).mockResolvedValueOnce(
      `<h1>T</h1><h2>Real</h2><p>${longBody}</p>` +
      `<div class="inline-image-placeholder" data-query="Bybit perpetual interface" data-caption="Bybit interface"></div>`,
    );

    await writeArticle(a.id);
    const [row] = await db().select().from(articles).where(eq(articles.id, a.id));
    expect(row.articleHtml).toContain('class="inline-image-placeholder"');
    expect(row.articleHtml).toContain('data-query="Bybit perpetual interface"');
    expect(row.articleHtml).toContain('data-caption="Bybit interface"');
  });

  it('throws TerminalError if output is under 1000 words', async () => {
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

    const longBody = Array.from({ length: 1100 }, () => 'word').join(' ');
    const body = [
      '<h1>T</h1>',
      '<p>' + longBody + '</p>',
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
