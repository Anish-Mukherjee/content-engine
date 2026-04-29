// scripts/fix-overlong-meta-backfill.ts
//
// One-shot backfill: shorten the article meta_description rows that overshot
// the 155-char SEO limit when rendered. Two cases:
//   1) Raw DB length > 155 (Ahrefs "Meta description too long: 2")
//   2) Raw DB length within 155 but contains `&`, which sanitize-html /
//      Next encodes to `&amp;` in the served HTML, pushing the rendered
//      length past 160. Ahrefs counts the rendered HTML, so the encoded
//      version is what gets flagged.
//
// The outline-stage prompt has been tightened so future articles stay in the
// 140-155 band and avoid `&`; this script rewrites the stragglers in place.
//
// Idempotent — safe to re-run on already-fixed rows.
//
// Usage:
//   npx tsx scripts/fix-overlong-meta-backfill.ts
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { revalidate } from '../src/integrations/frontend';
import { articles } from '../src/db/schema';
import { logger } from '../src/lib/logger';

const REPLACEMENTS: ReadonlyArray<{ slug: string; metaDescription: string }> = [
  {
    slug: 'crypto-futures-risk-management',
    metaDescription:
      'Master crypto futures risk management in 2026 — liquidation math, tiered stops, funding rate hacks, and trader psychology that survives every market cycle.',
  },
  {
    slug: 'cryptocurrency-candlestick-patterns',
    metaDescription:
      'Master 15+ cryptocurrency candlestick patterns with real BTC/ETH examples, backtested win rates, RSI confirmation tips, and risk management.',
  },
  {
    // Original contained `&` which encoded to `&amp;` (rendered length 163).
    slug: 'tradingview-webhook-crypto',
    metaDescription:
      'Automate crypto trades in under 20ms with TradingView webhooks — PineScript templates, JSON payloads, Binance/Bybit setup, and common error fixes.',
  },
  {
    // Original contained `&` which encoded to `&amp;` (rendered length 161).
    slug: 'candlestick-pattern-cryptocurrency',
    metaDescription:
      'Master 10+ candlestick patterns for crypto trading. Real BTC/ETH chart examples, backtested win rates, RSI combos, plus step-by-step entries and stops.',
  },
];

async function main() {
  const slugs: string[] = [];
  for (const r of REPLACEMENTS) {
    const len = r.metaDescription.length;
    if (len < 140 || len > 155) {
      logger.error({ slug: r.slug, len }, 'replacement out of 140-155 band — aborting');
      process.exit(2);
    }
    const result = await db()
      .update(articles)
      .set({ metaDescription: r.metaDescription })
      .where(eq(articles.slug, r.slug))
      .returning({ id: articles.id });
    if (result.length === 0) {
      logger.warn({ slug: r.slug }, 'no row matched — skipping');
      continue;
    }
    slugs.push(r.slug);
    logger.info({ slug: r.slug, len }, 'rewrote meta_description');
  }

  if (slugs.length === 0) {
    logger.info('no rows updated');
    return;
  }

  const paths = ['/blog', '/', ...slugs.map((s) => `/blog/${s}`)];
  try {
    await revalidate(paths);
    logger.info({ paths }, 'frontend revalidate ok');
  } catch (err) {
    logger.warn({ err, paths }, 'frontend revalidate failed (manual revalidate may be needed)');
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'fix-overlong-meta-backfill failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
