// src/integrations/google-indexing/index.ts
import { logger } from '../../lib/logger';
import { indexingClient } from './client';

export async function submitUrl(
  url: string,
  type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED',
): Promise<void> {
  try {
    await indexingClient().urlNotifications.publish({
      requestBody: { url, type },
    });
    logger.info({ url, type }, 'submitted to google indexing');
  } catch (err) {
    logger.warn({ err, url }, 'google indexing submit failed (soft-fail)');
  }
}
