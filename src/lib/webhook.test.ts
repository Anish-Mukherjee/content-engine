// src/lib/webhook.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyWebhook } from './webhook';

describe('notifyWebhook', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts JSON to the configured URL', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await notifyWebhook('https://example.com/hook', { event: 'stage_failed', stage: 'write' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ event: 'stage_failed', stage: 'write' });
  });

  it('does not throw on network failure — soft fail', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ENETUNREACH'));
    await expect(notifyWebhook('https://x.test/hook', { event: 'x' })).resolves.toBeUndefined();
  });

  it('is a no-op when webhookUrl is undefined', async () => {
    await notifyWebhook(undefined, { event: 'x' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
