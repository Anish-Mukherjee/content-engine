// src/integrations/unsplash/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.unsplash.com';

export async function search(query: string): Promise<unknown> {
  const url = `${BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) throw new TransientError(`unsplash ${res.status}`);
    throw new ExternalApiError('unsplash', res.status, body);
  }
  return JSON.parse(body);
}

export async function downloadBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new TransientError(`unsplash image ${res.status}`);
  return await res.arrayBuffer();
}
