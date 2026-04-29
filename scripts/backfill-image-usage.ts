// scripts/backfill-image-usage.ts
//
// Populate image_usage from existing articles. Run BEFORE dedupe:run, and
// before any new article generation, so the dedup checks have something to
// compare against. Idempotent — re-running clears existing rows for each
// article and re-inserts.
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { db } from '../src/db/client';
import { articles, imageUsage } from '../src/db/schema';
import { imagesDir } from '../src/lib/paths';
import { eq } from 'drizzle-orm';

async function hashFile(url: string): Promise<string | null> {
  if (!url.startsWith('/images/')) return null;
  const filename = url.replace(/^\/images\//, '');
  const fp = path.join(imagesDir(), filename);
  try {
    const buf = await fs.readFile(fp);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    console.warn(`  missing file on disk: ${fp}`);
    return null;
  }
}

async function main() {
  const rows = await db().select().from(articles);
  let inserted = 0;
  for (const row of rows) {
    await db().delete(imageUsage).where(eq(imageUsage.articleId, row.id));

    const hero = row.heroImage as { url?: string; unsplashId?: string | null; isFallback?: boolean } | null;
    if (hero?.url && !hero.isFallback) {
      const h = await hashFile(hero.url);
      if (h) {
        await db().insert(imageUsage).values({
          articleId: row.id, role: 'hero', position: null,
          url: hero.url,
          source: hero.unsplashId ? 'unsplash' : 'legacy',
          sourceId: hero.unsplashId ?? null,
          contentHash: h,
        });
        inserted++;
      }
    }

    const html = row.articleHtml ?? '';
    let i = 0;
    for (const m of html.matchAll(/<img[^>]+src="(\/images\/[^"]+)"/g)) {
      i++;
      const url = m[1];
      const h = await hashFile(url);
      if (!h) continue;
      await db().insert(imageUsage).values({
        articleId: row.id, role: 'inline', position: i,
        url,
        source: 'legacy', sourceId: null,
        contentHash: h,
      });
      inserted++;
    }
  }
  console.log(`Inserted ${inserted} image_usage rows across ${rows.length} articles.`);
  process.exit();
}

main().catch((err) => { console.error(err); process.exit(2); });
