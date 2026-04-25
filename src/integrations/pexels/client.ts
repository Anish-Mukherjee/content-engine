// src/integrations/pexels/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.pexels.com/v1';

export type PexelsPhotoSrc = {
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
  url: string;             // page URL on pexels.com (used for attribution link)
  photographer: string;
  photographer_url: string;
  src: PexelsPhotoSrc;
  alt: string;
};

type PexelsSearchResponse = {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
};

export async function searchImages(query: string): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new ExternalApiError('pexels', 0, 'PEXELS_API_KEY missing');

  // orientation=landscape filters server-side to roughly 16:9 photos so the
  // sharp 800x450 cover-crop in downloadAndSave does not clip subjects out
  // of view. size=medium ensures every result is at least 1280px wide,
  // comfortably above our 600px min-width gate.
  const url =
    `${BASE}/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=10` +
    `&orientation=landscape` +
    `&size=medium`;

  const res = await fetch(url, {
    headers: {
      Authorization: apiKey,
      'User-Agent': 'XeroGravity-ContentPipeline/1.0 (https://xerogravity.com)',
    },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`pexels ${res.status}`);
    }
    throw new ExternalApiError('pexels', res.status, body);
  }
  const data = JSON.parse(body) as PexelsSearchResponse;
  return data.photos ?? [];
}
