// One-shot: re-clean articleHtml for rows persisted before stripFaqSection
// was wired into write-article. Safe to re-run; rows already clean are skipped.
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { stripFaqSection } from '../src/lib/html';
import { logger } from '../src/lib/logger';

async function main() {
  const rows = await db()
    .select({ id: articles.id, slug: articles.slug, articleHtml: articles.articleHtml })
    .from(articles);

  let updated = 0;
  for (const row of rows) {
    const next = stripFaqSection(row.articleHtml ?? '');
    if (next === row.articleHtml) continue;
    await db().update(articles).set({ articleHtml: next }).where(eq(articles.id, row.id));
    updated++;
    logger.info({ slug: row.slug }, 'stripped faq-section');
  }

  logger.info({ scanned: rows.length, updated }, 'backfill done');
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, 'backfill failed');
  process.exit(1);
});
