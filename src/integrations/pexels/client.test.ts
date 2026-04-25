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

  it('sends Authorization header with the raw API key (no Bearer prefix)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [] }));
    await searchImages('q');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('test-key');
  });

  it('encodes the query and includes orientation=landscape', async () => {
    fetchMock.mockResolvedValueOnce(respond({ photos: [] }));
    await searchImages('bitcoin trading & charts');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('query=bitcoin%20trading%20%26%20charts');
    expect(url).toContain('orientation=landscape');
    expect(url).toContain('per_page=10');
  });

  it('returns photos array on 200', async () => {
    const photo = {
      id: 1, width: 4000, height: 2400,
      url: 'https://pexels.com/p/1',
      photographer: 'A', photographer_url: 'https://pexels.com/@a',
      src: { large: 'https://i.jpg', original: 'https://o.jpg', landscape: 'https://l.jpg',
             large2x: '', medium: '', small: '', portrait: '', tiny: '' },
      alt: 'cap',
    };
    fetchMock.mockResolvedValueOnce(respond({ photos: [photo] }));
    const photos = await searchImages('x');
    expect(photos).toEqual([photo]);
  });

  it('throws TransientError on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(searchImages('x')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws TransientError on 429', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate', { status: 429 }));
    await expect(searchImages('x')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws ExternalApiError on 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    await expect(searchImages('x')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('throws ExternalApiError when PEXELS_API_KEY is missing', async () => {
    delete process.env.PEXELS_API_KEY;
    await expect(searchImages('x')).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty array when response has no photos field', async () => {
    fetchMock.mockResolvedValueOnce(respond({ total_results: 0, page: 1, per_page: 10 }));
    const photos = await searchImages('x');
    expect(photos).toEqual([]);
  });
});
