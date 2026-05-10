// scripts/seed-keywords.ts
import 'dotenv/config';

import { pathToFileURL } from 'node:url';
import seeds from '../src/config/seed-keywords.json' with { type: 'json' };
import { db, closeDb } from '../src/db/client';
import { getDefaultSiteId } from '../src/db/queries';
import { seedKeywords } from '../src/db/schema';
import { logger } from '../src/lib/logger';

export async function importSeedKeywords(payload: Record<string, string[]>) {
  const siteId = await getDefaultSiteId();
  const rows: { keyword: string; category: string; siteId: string }[] = [];
  for (const [category, keywords] of Object.entries(payload)) {
    for (const keyword of keywords) {
      rows.push({ keyword, category, siteId });
    }
  }
  if (rows.length === 0) return;
  await db()
    .insert(seedKeywords)
    .values(rows)
    .onConflictDoNothing({ target: [seedKeywords.keyword, seedKeywords.category] });
}

async function main() {
  logger.info({ seedCount: Object.values(seeds).flat().length }, 'importing seed keywords');
  await importSeedKeywords(seeds as Record<string, string[]>);
  logger.info('done');
  await closeDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    logger.error({ err }, 'seed import failed');
    process.exit(1);
  });
}
