// One-shot: replace heroImage.altText for existing articles. Older articles
// were stored with whatever Unsplash returned in `alt_description` (e.g.
// "a screenshot of a video game") which has no relation to the article's
// topic and hurts both image SEO and accessibility. The pipeline now uses
// the article title as alt text — this script applies the same to rows
// already in the DB. Safe to re-run; rows whose altText already matches
// the title are skipped.
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { revalidate } from '../src/integrations/frontend';
import { logger } from '../src/lib/logger';

type HeroImage = {
  url: string;
  altText: string;
  width: number;
  height: number;
  photographerName: string | null;
  photographerUrl: string | null;
  unsplashId: string | null;
  isFallback: boolean;
};

async function main() {
  const rows = await db()
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      heroImage: articles.heroImage,
    })
    .from(articles);

  const updated: string[] = [];
  for (const row of rows) {
    const hero = row.heroImage as HeroImage | null;
    if (!hero) continue;
    const desiredAlt = (row.title ?? row.slug ?? '').trim();
    if (!desiredAlt) continue;
    if (hero.altText === desiredAlt) continue;
    const next: HeroImage = { ...hero, altText: desiredAlt };
    await db().update(articles).set({ heroImage: next }).where(eq(articles.id, row.id));
    updated.push(row.slug);
    logger.info({ slug: row.slug, oldAlt: hero.altText, newAlt: desiredAlt }, 'updated hero alt');
  }

  if (updated.length > 0) {
    const paths = ['/blog', '/', ...updated.map((s) => `/blog/${s}`)];
    await revalidate(paths);
    logger.info({ paths: paths.length }, 'revalidate called');
  }

  logger.info({ scanned: rows.length, updated: updated.length }, 'backfill done');
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, 'backfill failed');
  process.exit(1);
});
