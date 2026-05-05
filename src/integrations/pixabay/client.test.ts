// src/integrations/pixabay/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchImages } from './client';
import { ExternalApiError, TransientError } from '../../lib/errors';

describe('pixabay client', () => {
  const fetchMock = vi.fn();
  const ORIGINAL_KEY = process.env.PIXABAY_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.PIXABAY_API_KEY = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = ORIGINAL_KEY;
  });

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  it('passes the api key as a query param and applies image_type=photo orientation=horizontal filters', async () => {
    fetchMock.mockResolvedValueOnce(respond({ hits: [] }));
    await searchImages('bitcoin trading & charts');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://pixabay.com/api/');
    expect(url).toContain('key=test-key');
    expect(url).toContain('q=bitcoin+trading+%26+charts');
    expect(url).toContain('image_type=photo');
    expect(url).toContain('orientation=horizontal');
    expect(url).toContain('per_page=10');
    expect(url).toContain('safesearch=true');
  });

  it('returns the hits array on 200', async () => {
    const hit = {
      id: 1, pageURL: 'p', type: 'photo', tags: 't',
      webformatURL: 'w', webformatWidth: 640, webformatHeight: 426,
      largeImageURL: 'l', imageWidth: 1280, imageHeight: 853, user: 'u',
    };
    fetchMock.mockResolvedValueOnce(respond({ hits: [hit] }));
    const out = await searchImages('q');
    expect(out).toEqual([hit]);
  });

  it('returns empty array when api responds without hits field', async () => {
    fetchMock.mockResolvedValueOnce(respond({}));
    const out = await searchImages('q');
    expect(out).toEqual([]);
  });

  it('throws TransientError on 429', async () => {
    fetchMock.mockResolvedValueOnce(respond({ message: 'rate limited' }, 429));
    await expect(searchImages('q')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws TransientError on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(respond({ message: 'server error' }, 503));
    await expect(searchImages('q')).rejects.toBeInstanceOf(TransientError);
  });

  it('throws ExternalApiError on 4xx (non-429)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ message: 'bad request' }, 400));
    await expect(searchImages('q')).rejects.toBeInstanceOf(ExternalApiError);
  });

  it('throws when PIXABAY_API_KEY is missing', async () => {
    delete process.env.PIXABAY_API_KEY;
    await expect(searchImages('q')).rejects.toBeInstanceOf(ExternalApiError);
  });
});
