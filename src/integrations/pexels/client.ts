// src/integrations/pexels/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.pexels.com/v1';

export type PexelsSrc = {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  small: string;
  portrait: string;
  landscape: string;
  tiny: string;
};

export type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;            // pexels.com photo page
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: PexelsSrc;
  liked: boolean;
  alt: string;
};

type SearchResponse = {
  page?: number;
  per_page?: number;
  photos?: PexelsPhoto[];
  total_results?: number;
  next_page?: string;
};

export async function searchImages(query: string): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new ExternalApiError('pexels', 0, 'PEXELS_API_KEY missing');

  const url = new URL(`${BASE}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', '10');

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`pexels ${res.status}`);
    }
    throw new ExternalApiError('pexels', res.status, body);
  }
  const data = JSON.parse(body) as SearchResponse;
  return data.photos ?? [];
}
