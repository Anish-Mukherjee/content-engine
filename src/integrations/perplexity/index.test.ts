// src/integrations/perplexity/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { researchKeyword } from './index';
import { BRAND } from '../../config/brand';
import type { PerplexityBrief } from './types';

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

  function validBrief(overrides: Partial<PerplexityBrief> = {}): PerplexityBrief {
    return {
      keyword: 'Bybit futures',
      search_intent: 'informational',
      target_audience: 'traders',
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
      word_count_recommendation: 1400,
      faq_questions: ['f1', 'f2', 'f3'],
      ...overrides,
    };
  }

  it('parses a valid JSON brief', async () => {
    const brief = validBrief();
    fetchMock.mockResolvedValueOnce(briefResponse(JSON.stringify(brief)));

    const result = await researchKeyword('Bybit futures', BRAND);
    expect(result.keyword).toBe('Bybit futures');
    expect(result.word_count_recommendation).toBe(1400);
    expect(result.top_3_competitors).toHaveLength(3);
    expect(result.winning_angle).toBe('beat them');
  });

  it('retries once with a stricter reprompt when JSON parsing fails, then succeeds', async () => {
    const brief = validBrief({ keyword: 'x' });
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

  it('throws TerminalError naming the missing field when a required field is absent', async () => {
    const brief = validBrief();
    const { winning_angle, ...partial } = brief;
    void winning_angle;
    fetchMock.mockResolvedValueOnce(briefResponse(JSON.stringify(partial)));
    await expect(researchKeyword('x', BRAND)).rejects.toThrow(/winning_angle/);
  });
});
