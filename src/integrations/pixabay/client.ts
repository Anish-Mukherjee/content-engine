// src/integrations/pixabay/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://pixabay.com/api/';

export type PixabayHit = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
};

type SearchResponse = {
  total?: number;
  totalHits?: number;
  hits?: PixabayHit[];
};

export async function searchImages(query: string): Promise<PixabayHit[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new ExternalApiError('pixabay', 0, 'PIXABAY_API_KEY missing');

  // image_type=photo excludes illustrations/vectors which sharp can't crop well.
  // orientation=horizontal matches our 800×450 inline target. Pixabay returns
  // largeImageURL (~1280px) for all hits regardless of API tier — comfortably
  // above the cover-crop target.
  const url = new URL(BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('per_page', '10');
  url.searchParams.set('safesearch', 'true');

  const res = await fetch(url.toString());
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`pixabay ${res.status}`);
    }
    throw new ExternalApiError('pixabay', res.status, body);
  }
  const data = JSON.parse(body) as SearchResponse;
  return data.hits ?? [];
}
