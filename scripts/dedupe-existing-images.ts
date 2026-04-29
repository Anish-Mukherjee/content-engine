// scripts/dedupe-existing-images.ts
//
// Find articles whose hero or inline image's content hash collides with
// another article's (or duplicates within the same article), and replace
// the file in place using pickUniqueHero / pickUniqueInline. The image URL
// stays the same; only the bytes on disk change. Run AFTER dedupe:backfill.
import 'dotenv/config';
import { eq, and } from 'drizzle-orm';

import { db } from '../src/db/client';
import { articles, imageUsage } from '../src/db/schema';
import { pickUniqueHero, pickUniqueInline } from '../src/lib/image-fetch';
import { isCategory, type Category } from '../src/config/categories';

type DupeRef = {
  articleId: string; slug: string; category: Category; title: string;
  role: 'hero' | 'inline'; position: number | null;
  url: string; filenameStem: string; caption?: string; query?: string;
};

async function findDupes(): Promise<DupeRef[]> {
  // Group image_usage rows by content_hash. For each group of size > 1,
  // keep the oldest row and treat the rest as "losers" we must replace.
  const rows = await db().select().from(imageUsage).orderBy(imageUsage.createdAt);
  const byHash = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byHash.get(r.contentHash) ?? [];
    list.push(r);
    byHash.set(r.contentHash, list);
  }
  const losers: typeof rows = [];
  for (const list of byHash.values()) {
    if (list.length < 2) continue;
    losers.push(...list.slice(1));
  }

  const out: DupeRef[] = [];
  for (const loser of losers) {
    const [art] = await db().select().from(articles).where(eq(articles.id, loser.articleId)).limit(1);
    if (!art || !art.slug) continue;
    if (!isCategory(art.category)) continue;

    let caption: string | undefined;
    let query: string | undefined;
    if (loser.role === 'inline') {
      const html = art.articleHtml ?? '';
      const figs = [...html.matchAll(/<figure[^>]*class="article-image"[\s\S]*?<\/figure>/g)];
      const fig = figs[(loser.position ?? 1) - 1];
      if (fig) {
        const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(fig[0]);
        if (cap) {
          caption = cap[1].replace(/<[^>]*>/g, '').replace(/\s+—\s+.*$/, '').trim();
          query = caption;
        }
      }
    }

    out.push({
      articleId: art.id,
      slug: art.slug,
      category: art.category as Category,
      title: art.title ?? art.slug,
      role: loser.role as 'hero' | 'inline',
      position: loser.position,
      url: loser.url,
      filenameStem: loser.role === 'hero' ? `${art.slug}-hero` : `${art.slug}-inline-${loser.position}`,
      caption, query,
    });
  }
  return out;
}

async function main() {
  const dupes = await findDupes();
  console.log(`Found ${dupes.length} duplicate image slot(s) to replace.`);

  for (const d of dupes) {
    console.log(`\nReplacing ${d.role}${d.position ? `-${d.position}` : ''} for ${d.slug}...`);
    const conds = [
      eq(imageUsage.articleId, d.articleId),
      eq(imageUsage.role, d.role),
    ];
    if (d.position !== null) conds.push(eq(imageUsage.position, d.position));
    await db().delete(imageUsage).where(and(...conds));

    if (d.role === 'hero') {
      const out = await pickUniqueHero({
        category: d.category, articleId: d.articleId,
        slug: d.slug, altText: d.title, filenameStem: d.filenameStem,
      });
      console.log(`  -> ${out.unsplashId ? `unsplash ${out.unsplashId}` : 'fallback'} (${out.url})`);
      if (out.url !== d.url) {
        await db().update(articles).set({ heroImage: out as any }).where(eq(articles.id, d.articleId));
        console.log(`  -> article.heroImage updated (URL changed)`);
      }
    } else {
      const out = await pickUniqueInline({
        query: d.query ?? d.title, caption: d.caption ?? d.title,
        articleId: d.articleId, position: d.position!, filenameStem: d.filenameStem,
      });
      if (!out) {
        console.warn(`  ! no replacement found; existing duplicate file remains in place`);
      } else {
        console.log(`  -> ${out.source.sourceName} (${out.localUrl})`);
      }
    }
  }

  console.log('\nDone. Run `npm run dedupe:audit` to verify.');
  process.exit();
}

main().catch((err) => { console.error(err); process.exit(2); });
