// src/integrations/frontend/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revalidate } from './index';

describe('frontend revalidate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.FRONTEND_BASE_URL = 'https://xerogravity.com';
    process.env.FRONTEND_REVALIDATE_SECRET = 'sekret';
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts paths with secret header', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await revalidate(['/blog/foo', '/blog']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://xerogravity.com/api/revalidate');
    expect(init.headers['x-revalidate-token']).toBe('sekret');
    expect(JSON.parse(init.body as string)).toEqual({ paths: ['/blog/foo', '/blog'] });
  });

  it('is soft-fail on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('fail', { status: 500 }));
    await expect(revalidate(['/x'])).resolves.toBeUndefined();
  });
});
