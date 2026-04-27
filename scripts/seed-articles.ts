// scripts/seed-articles.ts
//
// One-shot operational script: insert N article rows directly with
// status='pending', then drive each one through research → outline → write →
// image → queue in sequence. Bypasses DataForSEO discovery for cases where
// you already know the exact keyword + category to publish on.
//
// Usage (on prod):
//   npx tsx scripts/seed-articles.ts
import 'dotenv/config';

import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { logger } from '../src/lib/logger';
import { driveArticle } from '../src/stages/drive-article';

type Seed = { keyword: string; category: string };

const SEEDS: Seed[] = [
  { keyword: 'Bybit futures trading', category: 'exchanges' },
  { keyword: 'crypto scalping strategy', category: 'strategies' },
  { keyword: 'crypto futures risk management', category: 'risk' },
  { keyword: 'TradingView webhook crypto', category: 'automation' },
  { keyword: 'RSI indicator crypto trading', category: 'indicators' },
];

async function main() {
  for (const s of SEEDS) {
    const [row] = await db()
      .insert(articles)
      .values({ keyword: s.keyword, category: s.category, status: 'pending' })
      .returning({ id: articles.id });
    logger.info({ id: row.id, keyword: s.keyword, category: s.category }, 'seeded article');
  }

  // Drive once per seed. Each call advances one pending article all the way
  // to 'scheduled', so SEEDS.length calls drive the whole batch.
  for (let i = 0; i < SEEDS.length; i++) {
    logger.info({ tick: i + 1, total: SEEDS.length }, 'driving next');
    await driveArticle();
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed-articles failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
