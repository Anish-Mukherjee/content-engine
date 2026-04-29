// scripts/version-image-urls.ts
//
// One-off backfill: append `?v=<contentHash[:8]>` to image URLs stored in
// articles.heroImage.url and articles.articleHtml `<img src=...>`. This
// busts browser caches for files that were replaced in place by dedupe:run
// (whose URL bytes changed but URL string did not). Idempotent — strips any
// existing v= and re-adds based on the file's current content hash.
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { imagesDir } from '../src/lib/paths';
import { versionedImageUrl } from '../src/lib/paths';

async function hashFile(url: string): Promise<string | null> {
  // url may already include ?v=...; strip query before resolving the file path
  const cleanPath = url.split('?')[0];
  if (!cleanPath.startsWith('/images/')) return null;
  const filename = cleanPath.replace(/^\/images\//, '');
  const fp = path.join(imagesDir(), filename);
  try {
    const buf = await fs.readFile(fp);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

async function main() {
  const rows = await db().select().from(articles);
  let updatedCount = 0;
  for (const row of rows) {
    let dirty = false;
    let nextHero = row.heroImage as { url?: string; isFallback?: boolean } | null;
    let nextHtml = row.articleHtml ?? '';

    // Hero
    if (nextHero?.url && !nextHero.isFallback) {
      const h = await hashFile(nextHero.url);
      if (h) {
        const versioned = versionedImageUrl(nextHero.url, h);
        if (versioned !== nextHero.url) {
          nextHero = { ...nextHero, url: versioned };
          dirty = true;
        }
      }
    }

    // Inline images in articleHtml
    const imgPattern = /(<img[^>]+src=")(\/images\/[^"]+)(")/g;
    const matches = [...nextHtml.matchAll(imgPattern)];
    let newHtml = '';
    let cursor = 0;
    for (const m of matches) {
      const fullSrc = m[2];
      const idx = m.index ?? 0;
      newHtml += nextHtml.slice(cursor, idx);
      newHtml += m[1];
      const h = await hashFile(fullSrc);
      newHtml += h ? versionedImageUrl(fullSrc, h) : fullSrc;
      newHtml += m[3];
      cursor = idx + m[0].length;
      if (h && versionedImageUrl(fullSrc, h) !== fullSrc) dirty = true;
    }
    newHtml += nextHtml.slice(cursor);
    nextHtml = newHtml;

    if (dirty) {
      await db().update(articles).set({
        heroImage: nextHero as any,
        articleHtml: nextHtml,
      }).where(eq(articles.id, row.id));
      updatedCount++;
    }
  }
  console.log(`Updated ${updatedCount} of ${rows.length} articles with versioned image URLs.`);
  process.exit();
}

main().catch((err) => { console.error(err); process.exit(2); });
