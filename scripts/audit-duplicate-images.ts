// scripts/audit-duplicate-images.ts
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { imagesDir } from '../src/lib/paths';

type ImgRef = { articleSlug: string; role: 'hero' | 'inline'; position: number | null; url: string };

function extractImageRefs(rows: typeof articles.$inferSelect[]): ImgRef[] {
  const refs: ImgRef[] = [];
  for (const row of rows) {
    const slug = row.slug ?? row.id;
    const hero = row.heroImage as { url?: string; isFallback?: boolean } | null;
    if (hero?.url && !hero.isFallback) {
      refs.push({ articleSlug: slug, role: 'hero', position: null, url: hero.url });
    }
    const html = row.articleHtml ?? '';
    let i = 0;
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      i++;
      refs.push({ articleSlug: slug, role: 'inline', position: i, url: m[1] });
    }
  }
  return refs;
}

async function hashFile(url: string): Promise<string | null> {
  if (!url.startsWith('/images/')) return null;
  const filename = url.replace(/^\/images\//, '');
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
  const refs = extractImageRefs(rows);
  const byHash = new Map<string, ImgRef[]>();
  for (const ref of refs) {
    const h = await hashFile(ref.url);
    if (!h) continue;
    const list = byHash.get(h) ?? [];
    list.push(ref);
    byHash.set(h, list);
  }

  let dupeCount = 0;
  for (const [h, list] of byHash) {
    if (list.length < 2) continue;
    dupeCount++;
    console.log(`\nhash ${h.slice(0, 16)}: ${list.length} usages`);
    for (const r of list) console.log(`  ${r.articleSlug} :: ${r.role} ${r.position ?? ''} :: ${r.url}`);
  }
  if (dupeCount === 0) {
    console.log('No duplicate images found.');
  } else {
    console.log(`\n${dupeCount} hash collision(s).`);
    process.exitCode = 1;
  }
  process.exit();
}

main().catch((err) => { console.error(err); process.exit(2); });
