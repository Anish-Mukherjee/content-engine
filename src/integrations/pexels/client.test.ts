// src/integrations/pexels/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchImages } from './client';
import { ExternalApiError, TransientError } from '../../lib/errors';

describe('pexels client', () => {
  const fetchMock = vi.fn();
  const ORIGINAL_KEY = process.env.PEXELS_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.PEXELS_API_KEY = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = ORIGINAL_KEY;
  });

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  it('sends Authorization header with the api key (no Bearer prefix)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [] }));
    await searchImages('q');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('test-key');
  });

  it('encodes the query and applies orientation=landscape per_page=10', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [] }));
    await searchImages('bitcoin trading & charts');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://api.pexels.com/v1/search');
    expect(url).toContain('query=bitcoin+trading+%26+charts');
    expect(url).toContain('orientation=landscape');
    expect(url).toContain('per_page=10');
  });

  it('returns the photos array on 200', async () => {
    const photo = {
      id: 1, width: 1200, height: 800, url: 'p',
      photographer: 'a', photographer_url: 'p', photographer_id: 1, avg_color: '', alt: '',
      src: { original: '', large2x: 'l', large: '', medium: '', small: '', portrait: '', landscape: '', tiny: '' },
      liked: false,
    };
    fetchMock.mockResolvedValueOnce(respond({ photos: [photo] }));
    const out = await searchImages('q');
    expect(out).toEqual([photo]);
  });

  it('returns empty array when api responds without photos field', async () => {
    fetchMock.mockResolvedValueOnce(respond({}));
    const out = await searchImages('q');
    expect(out).toEqual([]);
  });

  it('throws TransientError on 429', async () => {
    fetchMock.mockResolvedValueOnce(respond({ error: 'rate limited' }, 429));
    await expect(searchImages('q')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws TransientError on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(respond({ error: 'server error' }, 503));
    await expect(searchImages('q')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws ExternalApiError on 4xx (non-429)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ error: 'bad' }, 401));
    await expect(searchImages('q')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('throws when PEXELS_API_KEY is missing', async () => {
    delete process.env.PEXELS_API_KEY;
    await expect(searchImages('q')).rejects.toBeInstanceOf(ExternalApiError);
  });
});
