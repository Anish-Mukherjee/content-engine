import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitKeywordTask, fetchTaskResult } from './index';

describe('dataforseo integration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submitKeywordTask posts seed keyword and returns external task id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ tasks: [{ id: 'abc-123', status_code: 20100 }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await submitKeywordTask('Bybit futures trading');
    expect(result.externalTaskId).toBe('abc-123');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('keywords_for_keywords/task_post');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const body = JSON.parse(init.body as string);
    expect(body[0].keywords).toEqual(['Bybit futures trading']);
  });

  it('fetchTaskResult returns complete=false when DataForSEO is still processing', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ tasks: [{ status_code: 40602, status_message: 'Task In Queue', result: null }] }),
        { status: 200 },
      ),
    );
    const result = await fetchTaskResult('abc-123');
    expect(result.complete).toBe(false);
  });

  it('fetchTaskResult parses keyword data when complete', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [{
            status_code: 20000,
            result: [{
              items: [{
                keyword: 'bybit futures',
                search_volume: 2400,
                competition: 0.45,
                cpc: 1.8,
                keyword_difficulty: 38,
                trend: 'growing',
              }],
            }],
          }],
        }),
        { status: 200 },
      ),
    );
    const result = await fetchTaskResult('abc-123');
    expect(result.complete).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results?.[0]).toMatchObject({
      keyword: 'bybit futures', searchVolume: 2400, competition: 0.45,
    });
  });

  it('throws ExternalApiError on HTTP failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('internal error', { status: 500 }));
    await expect(submitKeywordTask('x')).rejects.toThrow(/dataforseo/);
  });
});
