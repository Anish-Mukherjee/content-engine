// src/lib/paths.ts
import path from 'node:path';

export function storageDir(): string {
  return process.env.STORAGE_DIR ?? path.resolve('storage');
}

export function imagesDir(): string {
  return path.join(storageDir(), 'images');
}

// Append a content-hash-based version query to an image URL so browser caches
// with `Cache-Control: immutable` get a new cache key when the file is replaced.
// Idempotent: strips any existing `?v=` or `&v=` first.
export function versionedImageUrl(url: string, contentHash: string): string {
  if (!contentHash) return url;
  const tag = contentHash.slice(0, 8);
  // Strip any existing v= param (and surrounding ?/& cleanup)
  const stripped = url
    .replace(/([?&])v=[^&]*&?/, (_m, sep) => (sep === '?' ? '?' : ''))
    .replace(/[?&]$/, '');
  const sep = stripped.includes('?') ? '&' : '?';
  return `${stripped}${sep}v=${tag}`;
}
