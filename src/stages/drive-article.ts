// src/stages/drive-article.ts
import { pickNextDrivable, getArticle, markFailed } from '../db/queries';
import { logger } from '../lib/logger';
import { notifyWebhook } from '../lib/webhook';
import { researchTopic } from './research-topic';
import { outlineArticle } from './outline-article';
import { writeArticle } from './write-article';
import { fetchImage } from './fetch-image';
import { queueArticle } from './queue-article';

type StepName = 'research' | 'outline' | 'write' | 'image' | 'queue';

type Step = {
  name: StepName;
  fn: (articleId: string) => Promise<void>;
  allowedStatuses: readonly string[];
};

const STEPS: readonly Step[] = [
  { name: 'research', fn: researchTopic,  allowedStatuses: ['pending', 'research_failed'] },
  { name: 'outline',  fn: outlineArticle, allowedStatuses: ['researched', 'outline_failed'] },
  { name: 'write',    fn: writeArticle,   allowedStatuses: ['outlined', 'write_failed'] },
  { name: 'image',    fn: fetchImage,     allowedStatuses: ['written', 'image_failed'] },
  { name: 'queue',    fn: queueArticle,   allowedStatuses: ['image_ready', 'queue_failed'] },
];

export async function driveArticle(): Promise<void> {
  const article = await pickNextDrivable();
  if (!article) {
    logger.info('no drivable article');
    return;
  }

  logger.info({ articleId: article.id, keyword: article.keyword }, 'driving article');

  for (const step of STEPS) {
    const fresh = await getArticle(article.id);
    if (!fresh || !step.allowedStatuses.includes(fresh.status)) continue;

    try {
      await step.fn(article.id);
    } catch (err) {
      const failedStatus = `${step.name}_failed`;
      await markFailed(article.id, failedStatus, err);
      const nextRetryCount = (fresh.retryCount ?? 0) + 1;
      logger.error({ err, articleId: article.id, stage: step.name }, 'stage failed');
      await notifyWebhook(process.env.WEBHOOK_URL, {
        event: 'stage_failed',
        articleId: article.id,
        keyword: article.keyword,
        stage: step.name,
        errorClass: err instanceof Error ? err.name : 'Error',
        errorMessage: err instanceof Error ? err.message : String(err),
        retryCount: nextRetryCount,
        willRetry: nextRetryCount < 3,
      });
      return;
    }
  }

  logger.info({ articleId: article.id }, 'article driven to scheduled');
}
