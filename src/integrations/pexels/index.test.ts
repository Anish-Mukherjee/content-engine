// src/integrations/pexels/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchImages } from './client';
import { findInlineCandidates } from './index';

vi.mock('./client');

describe('pexels findInlineCandidates', () => {
  beforeEach(() => vi.mocked(searchImages).mockReset());

  it('returns empty when api returns no photos', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([]);
    const out = await findInlineCandidates('q');
    expect(out).toEqual([]);
  });

  it('maps a photo to candidate using src.large2x and id as sourceId', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 2014422,
        width: 3024,
        height: 3780,
        url: 'https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/',
        photographer: 'Joey Farina',
        photographer_url: 'https://www.pexels.com/@joey-farina',
        photographer_id: 680589,
        avg_color: '#978E82',
        src: {
          original: 'https://images.pexels.com/photos/2014422/orig.jpeg',
          large2x: 'https://images.pexels.com/photos/2014422/large2x.jpeg',
          large: 'https://images.pexels.com/photos/2014422/large.jpeg',
          medium: 'https://images.pexels.com/photos/2014422/medium.jpeg',
          small: '',
          portrait: '',
          landscape: '',
          tiny: '',
        },
        liked: false,
        alt: 'Brown Rocks During Golden Hour',
      },
    ]);
    const out = await findInlineCandidates('rocks');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('2014422');
    expect(out[0].inlineSource.url).toBe('https://images.pexels.com/photos/2014422/large2x.jpeg');
    expect(out[0].inlineSource.sourceName).toBe('Pexels');
    expect(out[0].inlineSource.sourceUrl).toBe('https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/');
    expect(out[0].inlineSource.width).toBe(3024);
    expect(out[0].inlineSource.height).toBe(3780);
    expect(out[0].inlineSource.license).toBe('Pexels License');
    expect(out[0].inlineSource.requiresAttribution).toBe(false);
    expect(out[0].inlineSource.altText).toBe('Brown Rocks During Golden Hour');
  });

  it('falls back to query as altText when alt is empty', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 1, width: 1200, height: 800, url: 'https://x',
        photographer: 'A', photographer_url: 'https://a', photographer_id: 1,
        avg_color: '', alt: '',
        src: {
          original: '', large2x: 'https://l2x', large: '', medium: '',
          small: '', portrait: '', landscape: '', tiny: '',
        },
        liked: false,
      },
    ]);
    const out = await findInlineCandidates('fallback q');
    expect(out[0].inlineSource.altText).toBe('fallback q');
  });

  it('filters out photos with width < 600 or height < 400', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        id: 1, width: 599, height: 800, url: 'p',
        photographer: 'a', photographer_url: 'p', photographer_id: 1, avg_color: '', alt: '',
        src: { original: '', large2x: 'l1', large: '', medium: '', small: '', portrait: '', landscape: '', tiny: '' },
        liked: false,
      },
      {
        id: 2, width: 800, height: 399, url: 'p',
        photographer: 'a', photographer_url: 'p', photographer_id: 1, avg_color: '', alt: '',
        src: { original: '', large2x: 'l2', large: '', medium: '', small: '', portrait: '', landscape: '', tiny: '' },
        liked: false,
      },
      {
        id: 3, width: 1200, height: 800, url: 'p',
        photographer: 'a', photographer_url: 'p', photographer_id: 1, avg_color: '', alt: '',
        src: { original: '', large2x: 'l3', large: '', medium: '', small: '', portrait: '', landscape: '', tiny: '' },
        liked: false,
      },
    ]);
    const out = await findInlineCandidates('q');
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('3');
  });
});
