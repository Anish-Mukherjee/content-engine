// src/integrations/perplexity/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { researchKeyword } from './index';
import { BRAND } from '../../config/brand';

describe('perplexity integration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.PERPLEXITY_API_KEY = 'test';
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function briefResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  it('parses a valid JSON brief', async () => {
    const brief = {
      keyword: 'Bybit futures',
      search_intent: 'informational',
      target_audience: 'traders',
      top_questions: [], trending_angles: [], content_gaps: [],
      recent_developments: [], competitor_titles: [],
      recommended_title: 't', recommended_h2s: [], key_terms_to_include: [],
      word_count_recommendation: 1200,
    };
    fetchMock.mockResolvedValueOnce(briefResponse(JSON.stringify(brief)));

    const result = await researchKeyword('Bybit futures', BRAND);
    expect(result.keyword).toBe('Bybit futures');
    expect(result.word_count_recommendation).toBe(1200);
  });

  it('retries once with a stricter reprompt when JSON parsing fails, then succeeds', async () => {
    const brief = { keyword: 'x', search_intent: 'informational', target_audience: '',
      top_questions: [], trending_angles: [], content_gaps: [],
      recent_developments: [], competitor_titles: [],
      recommended_title: '', recommended_h2s: [], key_terms_to_include: [],
      word_count_recommendation: 1200 };
    fetchMock
      .mockResolvedValueOnce(briefResponse('Here is the brief: ```json\n{not valid}\n```'))
      .mockResolvedValueOnce(briefResponse(JSON.stringify(brief)));

    const result = await researchKeyword('x', BRAND);
    expect(result.keyword).toBe('x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws TerminalError after second bad JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(briefResponse('not json'))
      .mockResolvedValueOnce(briefResponse('still not json'));
    await expect(researchKeyword('x', BRAND)).rejects.toThrow(/json/i);
  });
});
