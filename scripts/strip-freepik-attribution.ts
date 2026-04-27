// scripts/strip-freepik-attribution.ts
//
// One-shot backfill: strip the "— Author — Freepik (Freepik License)" suffix
// from <figcaption> blocks in already-published articles. Needed when toggling
// Freepik to attribution-free (paid plan) — code change only affects future
// renderings, so existing articleHtml has to be rewritten in place.
//
// Pexels / Wikimedia / other CC sources are left untouched (their licenses
// require attribution). The regex is anchored on </figcaption> so caption
// text containing em-dashes is safe.
//
// Usage:
//   npx tsx scripts/strip-freepik-attribution.ts
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { revalidate } from '../src/integrations/frontend';
import { articles } from '../src/db/schema';
import { logger } from '../src/lib/logger';

// Matches the trailing Freepik attribution chain right before </figcaption>.
// Optional " — Author —" segment (rendered when source.attribution was set).
// The author class [^—<]+ deliberately EXCLUDES em-dash so a caption with
// internal em-dashes ("BTC chart — annotated for RSI") stays intact and the
// regex only strips from the author boundary onward.
// Lenient on rel="..." because sanitize-html may rewrite it (noopener noreferrer
// → nofollow noopener). href is optional because the sanitizer drops it when
// the source URL is http:// rather than https://.
const FREEPIK_SUFFIX = / — (?:[^—<]+ — )?<a (?:href="[^"]*"\s+)?target="_blank" rel="[^"]*">Freepik<\/a> \(Freepik License\)<\/figcaption>/g;

async function main() {
  const rows = await db()
    .select({ id: articles.id, slug: articles.slug, articleHtml: articles.articleHtml })
    .from(articles)
    .where(eq(articles.status, 'published'));

  const slugsToRevalidate: string[] = [];
  for (const r of rows) {
    const html = r.articleHtml ?? '';
    if (!html) continue;
    const stripped = html.replace(FREEPIK_SUFFIX, '</figcaption>');
    if (stripped === html) {
      logger.info({ slug: r.slug }, 'no Freepik suffix found, skipping');
      continue;
    }
    const figsBefore = (html.match(/<figcaption>/g) ?? []).length;
    const figsAfter = (stripped.match(/<figcaption>/g) ?? []).length;
    if (figsBefore !== figsAfter) {
      logger.error({ slug: r.slug, figsBefore, figsAfter }, 'figcaption count drift — aborting this article');
      continue;
    }
    await db().update(articles).set({ articleHtml: stripped }).where(eq(articles.id, r.id));
    slugsToRevalidate.push(r.slug ?? '');
    logger.info({ slug: r.slug }, 'stripped Freepik attribution');
  }

  if (slugsToRevalidate.length === 0) {
    logger.info('no articles needed updating');
    return;
  }

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
    logger.error({ err }, 'strip-freepik-attribution failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
