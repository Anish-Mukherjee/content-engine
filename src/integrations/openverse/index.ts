// src/integrations/openverse/index.ts
import type { InlineImageSource } from '../inline-images/types';
import { searchImages, type OpenverseImage } from './client';

const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

// License codes we trust for commercial use + modification. Openverse already
// filters these server-side via license_type=commercial,modification, but we
// double-check here in case the filter changes upstream.
const COMMERCIAL_OK = new Set(['by', 'by-sa', 'cc0', 'pdm']);

// Attribution is waived only for public-domain equivalents.
const NO_ATTRIBUTION_REQUIRED = new Set(['cc0', 'pdm']);

// Openverse indexes mostly raster images, but its Wikimedia-backed entries
// can include SVGs, which sharp cannot reliably rasterize at our fixed crop
// sizes. Filter by URL extension to match the same policy we use for
// Wikimedia direct search.
const RASTER_IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?)(?:$|\?)/i;

export async function findInlineImage(query: string): Promise<InlineImageSource | null> {
  const items = await searchImages(query);
  if (items.length === 0) return null;

  const usable = items.filter(meetsMinimums);
  if (usable.length === 0) return null;

  return toInlineImageSource(usable[0]);
}

function meetsMinimums(img: OpenverseImage): boolean {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (w < MIN_WIDTH || h < MIN_HEIGHT) return false;
  if (!COMMERCIAL_OK.has(img.license.toLowerCase())) return false;
  if (!isRasterImage(img)) return false;
  return true;
}

function isRasterImage(img: OpenverseImage): boolean {
  // Prefer the server-provided filetype when present; otherwise fall back to
  // URL extension sniffing.
  const ft = img.filetype?.toLowerCase();
  if (ft) {
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ft);
  }
  return RASTER_IMAGE_RE.test(img.url);
}

function toInlineImageSource(img: OpenverseImage): InlineImageSource {
  const license = formatLicense(img.license, img.license_version);
  const sourceName = formatProvider(img.provider);
  const requiresAttribution = !NO_ATTRIBUTION_REQUIRED.has(img.license.toLowerCase());

  return {
    url: img.url,
    sourceName,
    sourceUrl: img.foreign_landing_url,
    altText: img.title ?? '',
    width: img.width ?? MIN_WIDTH,
    height: img.height ?? MIN_HEIGHT,
    license,
    attribution: img.creator ?? null,
    requiresAttribution,
  };
}

function formatLicense(license: string, version: string | null): string {
  const l = license.toLowerCase();
  if (l === 'cc0') return 'CC0';
  if (l === 'pdm') return 'Public Domain Mark';
  const code = l.toUpperCase();
  const v = version ? ` ${version}` : '';
  return `CC ${code}${v}`;
}

function formatProvider(provider: string): string {
  const known: Record<string, string> = {
    flickr: 'Flickr',
    wikimedia: 'Wikimedia Commons',
    nasa: 'NASA',
    met: 'The Met',
    smithsonian: 'Smithsonian',
    rawpixel: 'Rawpixel',
    stocksnap: 'StockSnap',
    geographorguk: 'Geograph UK',
  };
  if (known[provider]) return known[provider];
  if (!provider) return 'Openverse';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
