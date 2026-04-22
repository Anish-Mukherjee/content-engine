// src/integrations/claude/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

import { checkRelevance, generateOutline, writeArticleBody, isTransientClaudeError } from './index';
import { BRAND } from '../../config/brand';

vi.mock('@anthropic-ai/sdk');

describe('claude integration', () => {
  const createMock = vi.fn();

  beforeEach(() => {
    createMock.mockReset();
    (Anthropic as unknown as vi.Mock).mockImplementation(function () {
      return { messages: { create: createMock } };
    });
    process.env.ANTHROPIC_API_KEY = 'test';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function textResp(text: string) {
    return { content: [{ type: 'text', text }] };
  }

  it('checkRelevance returns booleans in input order', async () => {
    createMock.mockResolvedValueOnce(textResp('["YES","NO","YES"]'));
    const result = await checkRelevance(['a', 'b', 'c'], BRAND);
    expect(result).toEqual([true, false, true]);
    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('claude-haiku-4-5-20251001');
  });

  it('generateOutline returns a parsed outline with required fields', async () => {
    const outline = {
      title: 'T', slug: 't', meta_title: 'T', meta_description: 'D',
      primary_keyword: 'k', secondary_keywords: [], target_audience: 'x',
      search_intent: 'informational', word_count: 1200,
      outline: { h1: 'T', introduction: '', sections: [], conclusion: '', faq: [] },
      internal_links: [], cta_placement: 'end', estimated_read_time: '5 min read',
    };
    createMock.mockResolvedValueOnce(textResp(JSON.stringify(outline)));
    const result = await generateOutline(
      { id: '1', keyword: 'k', searchVolume: 100 } as any,
      { keyword: 'k' } as any,
      BRAND,
    );
    expect(result.title).toBe('T');
    expect(result.slug).toBe('t');
  });

  it('writeArticleBody returns HTML string and uses Opus model', async () => {
    createMock.mockResolvedValueOnce(textResp('<h1>Hello</h1><p>Body</p>'));
    const html = await writeArticleBody(
      { keyword: 'k', secondaryKeywords: [] } as any,
      { word_count: 1200, search_intent: 'informational', target_audience: 'x', cta_placement: 'end',
        outline: { h1: '', introduction: '', sections: [], conclusion: '', faq: [] } } as any,
      { key_terms_to_include: [], recent_developments: [] } as any,
      BRAND,
    );
    expect(html).toContain('<h1>Hello</h1>');
    expect(createMock.mock.calls[0][0].model).toBe('claude-opus-4-7');
  });

  it('generateOutline throws TerminalError on unparseable response', async () => {
    createMock.mockResolvedValueOnce(textResp('not json'));
    await expect(
      generateOutline({ id: '1', keyword: 'k', searchVolume: 100 } as any, { keyword: 'k' } as any, BRAND),
    ).rejects.toThrow(/json/i);
  });

  it('isTransientClaudeError detects APIConnectionError by name', () => {
    const err = new Error('connection lost');
    err.name = 'APIConnectionError';
    expect(isTransientClaudeError(err)).toBe(true);

    const timeoutErr = new Error('timeout');
    timeoutErr.name = 'APIConnectionTimeoutError';
    expect(isTransientClaudeError(timeoutErr)).toBe(true);

    const rateLimit = { status: 429 };
    expect(isTransientClaudeError(rateLimit)).toBe(true);

    const plainErr = new Error('some other error');
    expect(isTransientClaudeError(plainErr)).toBe(false);
  });
});
