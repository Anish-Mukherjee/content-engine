import { TerminalError } from '../../lib/errors';
import { request } from './client';
import type { KeywordData } from './types';

const INCOMPLETE_CODES = new Set([40100, 40200, 40300, 40501, 40601, 40602, 40603]);

export async function submitKeywordTask(seedKeyword: string): Promise<{ externalTaskId: string }> {
  const payload = [{
    keywords: [seedKeyword],
    location_code: 2840, // United States
    language_code: 'en',
  }];
  const resp = await request('/keywords_data/google_ads/keywords_for_keywords/task_post', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as { tasks?: Array<{ id?: string }> };
  const id = resp.tasks?.[0]?.id;
  if (!id) throw new TerminalError('dataforseo task_post missing task id');
  return { externalTaskId: id };
}

export async function fetchTaskResult(
  externalTaskId: string,
): Promise<{ complete: boolean; results?: KeywordData[] }> {
  const resp = await request(
    `/keywords_data/google_ads/keywords_for_keywords/task_get/${externalTaskId}`,
  ) as {
    tasks?: Array<{
      status_code?: number;
      result?: Array<{ items?: unknown[] }>;
    }>;
  };
  const task = resp.tasks?.[0];
  const code = task?.status_code ?? 0;
  if (!task || INCOMPLETE_CODES.has(code)) return { complete: false };

  const items = task.result?.[0]?.items ?? [];
  const results: KeywordData[] = items.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      keyword: String(r.keyword ?? ''),
      searchVolume: typeof r.search_volume === 'number' ? r.search_volume : null,
      competition: typeof r.competition === 'number' ? r.competition : null,
      cpc: typeof r.cpc === 'number' ? r.cpc : null,
      keywordDifficulty: typeof r.keyword_difficulty === 'number' ? r.keyword_difficulty : null,
      trend: typeof r.trend === 'string' ? r.trend : null,
    };
  });
  return { complete: true, results };
}
