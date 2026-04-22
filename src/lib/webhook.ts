// src/lib/webhook.ts
import { logger } from './logger';

export async function notifyWebhook(
  webhookUrl: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn({ err, webhookUrl }, 'webhook delivery failed');
  } finally {
    clearTimeout(timeout);
  }
}
