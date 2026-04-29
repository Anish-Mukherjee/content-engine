// scripts/fix-signup-link-backfill.ts
//
// One-shot backfill: rewrite the broken `https://xerogravity.com/signup`
// href in already-published articles to `https://xerogravity.com/`. The site
// has no /signup page (auth is Google OAuth from a button on the homepage),
// so Ahrefs flagged every article that embedded the CTA as having a 4xx
// internal outlink.
//
// brand.ctaHtml has been updated, so future articles render the correct link;
// this script fixes the rows already persisted in the articles table.
//
// Usage:
//   npx tsx scripts/fix-signup-link-backfill.ts
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { revalidate } from '../src/integrations/frontend';
import { articles } from '../src/db/schema';
import { logger } from '../src/lib/logger';

// Anchor on `href=` so we never touch body text that happens to mention the
// /signup path. Both quote styles covered defensively (sanitize-html may
// rewrite either).
const PATTERNS: ReadonlyArray<{ from: RegExp; to: string }> = [
  { from: /href="https:\/\/xerogravity\.com\/signup"/g, to: 'href="https://xerogravity.com/"' },
  { from: /href='https:\/\/xerogravity\.com\/signup'/g, to: "href='https://xerogravity.com/'" },
];

function rewrite(html: string): { next: string; replaced: number } {
  let next = html;
  let replaced = 0;
  for (const { from, to } of PATTERNS) {
    const matches = next.match(from);
    if (matches) replaced += matches.length;
    next = next.replace(from, to);
  }
  return { next, replaced };
}

async function main() {
  const rows = await db()
    .select({ id: articles.id, slug: articles.slug, articleHtml: articles.articleHtml })
    .from(articles)
    .where(eq(articles.status, 'published'));

  const slugsToRevalidate: string[] = [];
  let totalReplaced = 0;
  for (const r of rows) {
    const html = r.articleHtml ?? '';
    if (!html) continue;
    const { next, replaced } = rewrite(html);
    if (replaced === 0) continue;
    await db().update(articles).set({ articleHtml: next }).where(eq(articles.id, r.id));
    if (r.slug) slugsToRevalidate.push(r.slug);
    totalReplaced += replaced;
    logger.info({ slug: r.slug, replaced }, 'rewrote /signup hrefs');
  }

  logger.info({ scanned: rows.length, articlesUpdated: slugsToRevalidate.length, totalReplaced }, 'backfill done');

  if (slugsToRevalidate.length === 0) return;

  const paths = ['/blog', '/', ...slugsToRevalidate.map((s) => `/blog/${s}`)];
  try {
    await revalidate(paths);
    logger.info({ paths }, 'frontend revalidate ok');
  } catch (err) {
    logger.warn({ err, paths }, 'frontend revalidate failed (manual revalidate may be needed)');
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'fix-signup-link-backfill failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
