// src/integrations/wikimedia/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://commons.wikimedia.org/w/api.php';

type ExtMetadataField = { value?: string };

export type WikimediaImageInfo = {
  url: string;
  width: number;
  height: number;
  descriptionurl: string;
  extmetadata?: Record<string, ExtMetadataField>;
};

export type WikimediaPage = {
  title: string;
  index?: number; // Search-result rank (1 = top). Present when generator=search.
  imageinfo?: WikimediaImageInfo[];
};

type WikimediaResponse = {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
};

export async function searchImages(query: string): Promise<WikimediaPage[]> {
  // gsrnamespace=6 restricts to the File: namespace (actual images).
  // origin=* is a Wikimedia quirk for CORS-friendly cross-origin requests;
  // harmless server-side.
  const url =
    `${BASE}?action=query` +
    `&generator=search` +
    `&gsrnamespace=6` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrlimit=5` +
    `&prop=imageinfo` +
    `&iiprop=url|extmetadata|dimensions` +
    `&format=json` +
    `&origin=*`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'XeroGravity-ContentPipeline/1.0 (https://xerogravity.com)' },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`wikimedia ${res.status}`);
    }
    throw new ExternalApiError('wikimedia', res.status, body);
  }
  const data = JSON.parse(body) as WikimediaResponse;
  const pages = Object.values(data.query?.pages ?? {});
  // Pages are keyed by pageid in the response object, so Object.values preserves
  // pageid order, not search-rank order. Re-sort by the `index` field so the
  // top search hit comes first.
  return pages.sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));
}
