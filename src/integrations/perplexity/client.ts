// src/integrations/perplexity/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

export async function chatCompletion(params: {
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 60_000);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model ?? 'sonar',
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429) throw new TransientError(`perplexity ${res.status}`);
      throw new ExternalApiError('perplexity', res.status, body);
    }
    const json = JSON.parse(body);
    return json?.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new TransientError('perplexity timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
