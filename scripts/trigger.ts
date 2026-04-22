// scripts/trigger.ts
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { logger } from '../src/lib/logger';
import { discoverKeywords } from '../src/stages/discover-keywords';
import { harvestKeywords } from '../src/stages/harvest-keywords';
import { driveArticle } from '../src/stages/drive-article';
import { publishDue } from '../src/stages/publish-due';
import { researchTopic } from '../src/stages/research-topic';
import { outlineArticle } from '../src/stages/outline-article';
import { writeArticle } from '../src/stages/write-article';
import { fetchImage } from '../src/stages/fetch-image';
import { queueArticle } from '../src/stages/queue-article';

const STAGES: Record<string, (id?: string) => Promise<void>> = {
  discover: async () => { await discoverKeywords(); },
  harvest:  async () => { await harvestKeywords(); },
  drive:    async () => { await driveArticle(); },
  publish:  async () => { await publishDue(); },
  research: async (id) => { if (!id) throw new Error('articleId required'); await researchTopic(id); },
  outline:  async (id) => { if (!id) throw new Error('articleId required'); await outlineArticle(id); },
  write:    async (id) => { if (!id) throw new Error('articleId required'); await writeArticle(id); },
  image:    async (id) => { if (!id) throw new Error('articleId required'); await fetchImage(id); },
  queue:    async (id) => { if (!id) throw new Error('articleId required'); await queueArticle(id); },
};

async function main() {
  const [stage, articleId] = process.argv.slice(2);
  const handler = STAGES[stage];
  if (!handler) {
    logger.error({ available: Object.keys(STAGES) }, 'unknown stage');
    process.exit(1);
  }
  logger.info({ stage, articleId }, 'trigger start');
  await handler(articleId);
  logger.info('trigger done');
  await closeDb();
}

main().catch((err) => {
  logger.error({ err }, 'trigger failed');
  process.exit(1);
});
