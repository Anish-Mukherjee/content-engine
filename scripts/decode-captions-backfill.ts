// One-shot: decode double-encoded HTML entities in articleHtml that were
// produced before findInlineImagePlaceholders learned to decode data-caption
// attributes (see src/lib/html.ts). Without this fix, figcaptions render
// the literal text "P&amp;L" instead of "P&L". Safe to re-run; rows already
// clean are skipped.
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { revalidate } from '../src/integrations/frontend';
import { logger } from '../src/lib/logger';

const DOUBLE_ENCODED_ENTITY_RE = /&amp;(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi;

function fixDoubleEncodedEntities(html: string): string {
  return html.replace(DOUBLE_ENCODED_ENTITY_RE, '&$1;');
}

async function main() {
  const rows = await db()
    .select({ id: articles.id, slug: articles.slug, articleHtml: articles.articleHtml })
    .from(articles);

  const updated: string[] = [];
  for (const row of rows) {
    const next = fixDoubleEncodedEntities(row.articleHtml ?? '');
    if (next === row.articleHtml) continue;
    await db().update(articles).set({ articleHtml: next }).where(eq(articles.id, row.id));
    updated.push(row.slug);
    logger.info({ slug: row.slug }, 'decoded entities');
  }

  if (updated.length > 0) {
    const paths = ['/blog', '/', ...updated.map((s) => `/blog/${s}`)];
    await revalidate(paths);
    logger.info({ paths }, 'revalidate called');
  }

  logger.info({ scanned: rows.length, updated: updated.length }, 'backfill done');
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, 'backfill failed');
  process.exit(1);
});
