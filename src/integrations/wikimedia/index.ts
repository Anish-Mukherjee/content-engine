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

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const pages = await searchImages(query);
  if (pages.length === 0) return null;

  const valid = pages.filter((p) => {
    const info = p.imageinfo?.[0];
    if (!info) return false;
    if (info.width < MIN_WIDTH || info.height < MIN_HEIGHT) return false;
    if (!RASTER_IMAGE_RE.test(info.url)) return false;
    return true;
  });
  if (valid.length === 0) return null;

  const page = valid[0];
  const info = page.imageinfo![0];

  return {
    url: info.url,
    sourceName: 'Wikimedia Commons',
    sourceUrl: info.descriptionurl,
    altText: extValue(page, 'ImageDescription') ?? query,
    width: info.width,
    height: info.height,
    license: extValue(page, 'LicenseShortName') ?? 'Creative Commons',
    attribution: extValue(page, 'Artist'),
    requiresAttribution: true,
  };
}
