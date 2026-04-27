// scripts/drive-ids.ts
//
// Drive specific article IDs through the full research → outline → write →
// image → queue flow, in order. Bypasses pickNextDrivable, so a backlog of
// other pending articles does not interfere — useful for one-off batches
// where you need *these specific* articles published, not whatever's oldest.
//
// Usage:
//   npx tsx scripts/drive-ids.ts <id1> <id2> ...
import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';

import { closeDb, db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { logger } from '../src/lib/logger';
import { fetchImage } from '../src/stages/fetch-image';
import { outlineArticle } from '../src/stages/outline-article';
import { queueArticle } from '../src/stages/queue-article';
import { researchTopic } from '../src/stages/research-topic';
import { writeArticle } from '../src/stages/write-article';

type StepName = 'research' | 'outline' | 'write' | 'image' | 'queue';

type Step = {
  name: StepName;
  fn: (id: string) => Promise<void>;
  // Statuses where this step is the next legal advance. Mirrors drive-article's
  // STEPS table so a partially-driven article picks up where it left off.
  allowedStatuses: readonly string[];
};

const STEPS: readonly Step[] = [
  { name: 'research', fn: researchTopic,  allowedStatuses: ['pending', 'research_failed'] },
  { name: 'outline',  fn: outlineArticle, allowedStatuses: ['researched', 'outline_failed'] },
  { name: 'write',    fn: writeArticle,   allowedStatuses: ['outlined', 'write_failed'] },
  { name: 'image',    fn: fetchImage,     allowedStatuses: ['written', 'image_failed'] },
  { name: 'queue',    fn: queueArticle,   allowedStatuses: ['image_ready', 'queue_failed'] },
];

async function driveOne(id: string): Promise<void> {
  for (const step of STEPS) {
    const [fresh] = await db().select().from(articles).where(eq(articles.id, id)).limit(1);
    if (!fresh) throw new Error(`article ${id} not found`);
    if (!step.allowedStatuses.includes(fresh.status)) {
      logger.info({ id, status: fresh.status, step: step.name }, 'skipping step (status mismatch)');
      continue;
    }
    logger.info({ id, step: step.name }, 'running step');
    await step.fn(id);
  }
  const [final] = await db().select({ status: articles.status, slug: articles.slug, scheduledAt: articles.scheduledAt }).from(articles).where(eq(articles.id, id)).limit(1);
  logger.info({ id, status: final?.status, slug: final?.slug, scheduledAt: final?.scheduledAt }, 'article driven');
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('usage: drive-ids.ts <id1> <id2> ...');

  const rows = await db().select({ id: articles.id, keyword: articles.keyword, status: articles.status }).from(articles).where(inArray(articles.id, ids));
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    throw new Error(`missing article ids: ${missing.join(', ')}`);
  }
  for (const row of rows) {
    logger.info({ id: row.id, keyword: row.keyword, status: row.status }, 'queued for drive');
  }

  for (const id of ids) {
    try {
      await driveOne(id);
    } catch (err) {
      logger.error({ err, id }, 'drive failed; moving on');
    }
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'drive-ids failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
