// src/integrations/freepik/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.freepik.com';

export type FreepikLicense = { type: string; url: string };

export type FreepikResource = {
  id: number;
  title: string;
  url: string;            // freepik.com page URL — used for attribution link
  filename: string;
  licenses: FreepikLicense[];
  image: {
    type: string;          // "photo" | "vector" | ...
    orientation: string;   // "horizontal" | "vertical" | "square"
    source: {
      key: string;         // "large"
      url: string;         // preview URL on img.b2bpic.net (~626×417)
      size: string;        // "626x417" — preview pixel dims
    };
  };
  author: {
    id: number;
    name: string;
    slug: string;
    avatar: string;
    assets: number;
  };
};

type SearchResponse = {
  data: FreepikResource[];
  meta: {
    current_page: number;
    per_page: number;
    last_page: number;
    total: number;
  };
};

type DownloadResponse = {
  data: { filename: string; url: string };
};

const HEADERS_BASE = {
  Accept: 'application/json',
  'User-Agent': 'XeroGravity-ContentPipeline/1.0 (https://xerogravity.com)',
};

function authHeaders(): Record<string, string> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) throw new ExternalApiError('freepik', 0, 'FREEPIK_API_KEY missing');
  return { ...HEADERS_BASE, 'x-freepik-api-key': apiKey };
}

export async function searchImages(query: string): Promise<FreepikResource[]> {
  const headers = authHeaders();

  // orientation=landscape ensures the 800×450 cover-crop downstream does not
  // clip subjects out of view. content_type=photo excludes vectors/PSDs which
  // sharp can't rasterise. license=freemium is the only tier our API key
  // actually has rights to download.
  const url = new URL(`${BASE}/v1/resources`);
  url.searchParams.set('term', query);
  url.searchParams.set('limit', '10');
  url.searchParams.set('page', '1');
  url.searchParams.set('filters[content_type][photo]', '1');
  url.searchParams.set('filters[orientation][landscape]', '1');
  url.searchParams.set('filters[license][freemium]', '1');

  const res = await fetch(url.toString(), { headers });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`freepik ${res.status}`);
    }
    throw new ExternalApiError('freepik', res.status, body);
  }
  const data = JSON.parse(body) as SearchResponse;
  return data.data ?? [];
}

// Resolves a search-result id into a directly-downloadable, time-signed image
// URL on img.freepik.com. image_size=medium yields ~1500px wide JPEGs —
// comfortably above our 800×450 cover-crop target. Tokens expire after ~1h
// so callers should download the bytes immediately, not store the URL.
export async function getDownloadUrl(resourceId: number): Promise<string> {
  const headers = authHeaders();

  const url = `${BASE}/v1/resources/${resourceId}/download?image_size=medium`;
  const res = await fetch(url, { headers });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`freepik download ${res.status}`);
    }
    throw new ExternalApiError('freepik', res.status, body);
  }
  const data = JSON.parse(body) as DownloadResponse;
  return data.data.url;
}
