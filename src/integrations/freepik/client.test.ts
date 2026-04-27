// src/integrations/freepik/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchImages, getDownloadUrl } from './client';
import { ExternalApiError, TransientError } from '../../lib/errors';

describe('freepik client', () => {
  const fetchMock = vi.fn();
  const ORIGINAL_KEY = process.env.FREEPIK_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.FREEPIK_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.FREEPIK_API_KEY;
    else process.env.FREEPIK_API_KEY = ORIGINAL_KEY;
  });

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  describe('searchImages', () => {
    it('sends x-freepik-api-key header (not Authorization)', async () => {
      fetchMock.mockResolvedValueOnce(respond({ data: [], meta: {} }));
      await searchImages('q');
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['x-freepik-api-key']).toBe('test-key');
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('encodes the query and includes content_type, orientation, license filters', async () => {
      fetchMock.mockResolvedValueOnce(respond({ data: [], meta: {} }));
      await searchImages('bitcoin trading & charts');
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('term=bitcoin+trading+%26+charts');
      expect(url).toContain('filters%5Bcontent_type%5D%5Bphoto%5D=1');
      expect(url).toContain('filters%5Borientation%5D%5Blandscape%5D=1');
      expect(url).toContain('filters%5Blicense%5D%5Bfreemium%5D=1');
      expect(url).toContain('limit=10');
    });

    it('returns the data array on 200', async () => {
      const photo = {
        id: 1,
        title: 'A trader',
        url: 'https://www.freepik.com/free-photo/trader_1.htm',
        filename: '1.jpg',
        licenses: [{ type: 'freemium', url: 'https://lic' }],
        image: { type: 'photo', orientation: 'horizontal', source: { key: 'large', url: 'https://img/1.jpg', size: '626x417' } },
        author: { id: 1, name: 'A', slug: 'a', avatar: '', assets: 1 },
      };
      fetchMock.mockResolvedValueOnce(respond({ data: [photo], meta: {} }));
      const out = await searchImages('x');
      expect(out).toEqual([photo]);
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

    it('throws ExternalApiError when FREEPIK_API_KEY is missing', async () => {
      delete process.env.FREEPIK_API_KEY;
      await expect(searchImages('x')).rejects.toBeInstanceOf(ExternalApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns empty array when response has no data field', async () => {
      fetchMock.mockResolvedValueOnce(respond({ meta: {} }));
      const out = await searchImages('x');
      expect(out).toEqual([]);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns the signed download URL from data.url', async () => {
      fetchMock.mockResolvedValueOnce(respond({
        data: { filename: 'a.jpg', url: 'https://img.freepik.com/a.jpg?token=...' },
      }));
      const url = await getDownloadUrl(123);
      expect(url).toBe('https://img.freepik.com/a.jpg?token=...');
    });

    it('requests the medium image_size variant', async () => {
      fetchMock.mockResolvedValueOnce(respond({
        data: { filename: 'a.jpg', url: 'https://img.freepik.com/a.jpg' },
      }));
      await getDownloadUrl(456);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/v1/resources/456/download');
      expect(url).toContain('image_size=medium');
    });

    it('throws TransientError on 5xx', async () => {
      fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }));
      await expect(getDownloadUrl(1)).rejects.toBeInstanceOf(TransientError);
    });

    it('throws ExternalApiError on 404', async () => {
      fetchMock.mockResolvedValueOnce(new Response('gone', { status: 404 }));
      await expect(getDownloadUrl(1)).rejects.toBeInstanceOf(ExternalApiError);
    });

    it('throws ExternalApiError when FREEPIK_API_KEY is missing', async () => {
      delete process.env.FREEPIK_API_KEY;
      await expect(getDownloadUrl(1)).rejects.toBeInstanceOf(ExternalApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
