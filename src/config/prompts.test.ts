// src/config/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { BRAND } from './brand';
import { claudeArticleUser, claudeOutlineUser, perplexityResearchUser, todayLine } from './prompts';

const year = String(new Date().getUTCFullYear());

const brief = {
  search_intent: 'informational',
  target_audience: 'traders',
  top_3_competitors: [],
  winning_angle: 'a',
  unique_hook: 'h',
  content_gaps: [],
  questions_to_answer: [],
  key_stats_to_include: [],
  key_terms_to_include: [],
  recommended_h2s: [],
  recommended_tone: 't',
  word_count_recommendation: 1200,
  faq_questions: [],
};

describe('prompts carry the current date', () => {
  // 2026-09-09: the first meme-niche articles were titled "... Guide 2025" —
  // the models default to their training-cutoff year unless told the date.
  it('todayLine names today and the year to use', () => {
    expect(todayLine()).toMatch(new RegExp(`Today is ${year}-\\d{2}-\\d{2}`));
    expect(todayLine()).toContain(year);
  });

  it('research, outline and article prompts all include it', () => {
    expect(perplexityResearchUser('k')).toContain(`Today is ${year}`);
    expect(claudeOutlineUser({ keyword: 'k', searchVolume: null, brief })).toContain(`Today is ${year}`);
    const article = claudeArticleUser({
      keyword: 'k', secondaryKeywords: [], brief, ctaPlacement: 'end', ctaHtml: '<p/>',
      wordCount: 1200, searchIntent: 'informational', audience: 'traders',
      outline: { outline: { h1: 'H', introduction: 'i', sections: [], conclusion: 'c', faq: [] } } as never,
    });
    expect(article).toContain(`Today is ${year}`);
  });
});
