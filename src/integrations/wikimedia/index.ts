// src/integrations/wikimedia/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { searchImages, type WikimediaPage } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

// Wikimedia's File: namespace (gsrnamespace=6) includes PDFs, videos, audio,
// DjVu documents — anything uploaded. sharp can only process raster images,
// so we hard-filter to the formats we know work.
const RASTER_IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim();
}

function extValue(page: WikimediaPage, key: string): string | null {
  const raw = page.imageinfo?.[0]?.extmetadata?.[key]?.value;
  if (!raw) return null;
  const stripped = stripHtml(raw);
  return stripped === '' ? null : stripped;
}

export type WikimediaCandidate = {
  sourceId: string;     // the descriptionurl — stable per file
  inlineSource: InlineImageSource;
};

export async function findInlineCandidates(query: string): Promise<WikimediaCandidate[]> {
  const pages = await searchImages(query);
  const out: WikimediaCandidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    if (info.width < MIN_WIDTH || info.height < MIN_HEIGHT) continue;
    if (!RASTER_IMAGE_RE.test(info.url)) continue;
    out.push({
      sourceId: info.descriptionurl,
      inlineSource: {
        url: info.url,
        sourceName: 'Wikimedia Commons',
        sourceUrl: info.descriptionurl,
        altText: extValue(page, 'ImageDescription') ?? query,
        width: info.width,
        height: info.height,
        license: extValue(page, 'LicenseShortName') ?? 'Creative Commons',
        attribution: extValue(page, 'Artist'),
        requiresAttribution: true,
      },
    });
  }
  return out;
}

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const cands = await findInlineCandidates(query);
  return cands[0]?.inlineSource ?? null;
}
