// scripts/seed-keywords.ts
import 'dotenv/config';

import { pathToFileURL } from 'node:url';
import seeds from '../src/config/seed-keywords.json' with { type: 'json' };
import { db, closeDb } from '../src/db/client';
import { seedKeywords } from '../src/db/schema';
import { logger } from '../src/lib/logger';

export type SeedRow = { keyword: string; category: string };
export type SeedPayload = SeedRow[] | Record<string, string[]>;

export async function importSeedKeywords(payload: SeedPayload) {
  const rows: SeedRow[] = [];
  if (Array.isArray(payload)) {
    for (const { keyword, category } of payload) rows.push({ keyword, category });
  } else {
    for (const [category, keywords] of Object.entries(payload)) {
      for (const keyword of keywords) rows.push({ keyword, category });
    }
  }
  if (rows.length === 0) return;
  await db()
    .insert(seedKeywords)
    .values(rows)
    .onConflictDoNothing({ target: [seedKeywords.keyword, seedKeywords.category] });
}

async function main() {
  const payload = seeds as SeedPayload;
  const seedCount = Array.isArray(payload) ? payload.length : Object.values(payload).flat().length;
  logger.info({ seedCount }, 'importing seed keywords');
  await importSeedKeywords(payload);
  logger.info('done');
  await closeDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    logger.error({ err }, 'seed import failed');
    process.exit(1);
  });
}
