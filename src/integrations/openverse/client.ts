// src/integrations/openverse/client.ts
import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.openverse.org/v1';

export type OpenverseImage = {
  id: string;
  title: string | null;
  url: string;                 // direct image URL
  foreign_landing_url: string; // page the image came from (for attribution link)
  creator: string | null;
  creator_url: string | null;
  license: string;             // e.g. "by", "by-sa", "cc0", "pdm"
  license_version: string | null;
  license_url: string | null;
  provider: string;            // e.g. "flickr", "wikimedia"
  source: string;
  width: number | null;
  height: number | null;
  filetype: string | null;
};

type OpenverseResponse = {
  result_count: number;
  results: OpenverseImage[];
};

// license_type=commercial,modification restricts results to CC licenses that
// allow commercial use AND modification — exactly what we need for a
// commercial blog that crops and places images inline. Maps to CC BY, CC
// BY-SA, CC0, PDM; excludes NC/ND variants.
const LICENSE_TYPE = 'commercial,modification';

export async function searchImages(query: string): Promise<OpenverseImage[]> {
  const url =
    `${BASE}/images/` +
    `?q=${encodeURIComponent(query)}` +
    `&license_type=${LICENSE_TYPE}` +
    `&page_size=10` +
    `&mature=false`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'XeroGravity-ContentPipeline/1.0 (https://xerogravity.com)' },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw new TransientError(`openverse ${res.status}`);
    }
    throw new ExternalApiError('openverse', res.status, body);
  }
  const data = JSON.parse(body) as OpenverseResponse;
  return data.results ?? [];
}
