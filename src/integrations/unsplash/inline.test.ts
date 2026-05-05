// src/integrations/unsplash/inline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search } from './client';
import { findInlineCandidates } from './inline';

vi.mock('./client');

describe('unsplash findInlineCandidates', () => {
  beforeEach(() => vi.mocked(search).mockReset());

  it('returns empty when api returns no results', async () => {
    vi.mocked(search).mockResolvedValueOnce({ results: [] });
    const out = await findInlineCandidates('q');
    expect(out).toEqual([]);
  });

  it('maps a result to a candidate using a 1200-wide raw URL and id as sourceId', async () => {
    vi.mocked(search).mockResolvedValueOnce({
      results: [
        {
          id: 'abc123',
          alt_description: 'A bitcoin chart on a screen',
          urls: { raw: 'https://images.unsplash.com/photo-xyz?ixid=foo' },
          user: { name: 'Jane Photographer', links: { html: 'https://unsplash.com/@jane' } },
          width: 4000,
          height: 2667,
        },
      ],
    });
    const out = await findInlineCandidates('bitcoin chart');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('abc123');
    // The url should request a 1200-wide crop on the raw URL.
    expect(out[0].inlineSource.url).toContain('https://images.unsplash.com/photo-xyz');
    expect(out[0].inlineSource.url).toContain('w=1200');
    expect(out[0].inlineSource.url).toContain('q=80');
    expect(out[0].inlineSource.sourceName).toBe('Unsplash');
    expect(out[0].inlineSource.sourceUrl).toBe('https://unsplash.com/@jane');
    expect(out[0].inlineSource.width).toBe(4000);
    expect(out[0].inlineSource.height).toBe(2667);
    expect(out[0].inlineSource.license).toBe('Unsplash License');
    expect(out[0].inlineSource.requiresAttribution).toBe(false);
    expect(out[0].inlineSource.altText).toBe('A bitcoin chart on a screen');
  });

  it('falls back to query as altText when alt_description is missing or null', async () => {
    vi.mocked(search).mockResolvedValueOnce({
      results: [
        {
          id: 'x', alt_description: null,
          urls: { raw: 'https://images.unsplash.com/photo-x' },
          user: { name: 'A', links: { html: 'https://u/@a' } },
          width: 1200, height: 800,
        },
      ],
    });
    const out = await findInlineCandidates('fallback q');
    expect(out[0].inlineSource.altText).toBe('fallback q');
  });

  it('filters out results with width < 600 or height < 400', async () => {
    vi.mocked(search).mockResolvedValueOnce({
      results: [
        { id: '1', alt_description: 'a', urls: { raw: 'r' }, user: { name: 'a', links: { html: 'h' } }, width: 599, height: 800 },
        { id: '2', alt_description: 'a', urls: { raw: 'r' }, user: { name: 'a', links: { html: 'h' } }, width: 800, height: 399 },
        { id: '3', alt_description: 'a', urls: { raw: 'https://images.unsplash.com/photo-3' }, user: { name: 'a', links: { html: 'h3' } }, width: 1200, height: 800 },
      ],
    });
    const out = await findInlineCandidates('q');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('3');
  });
});
