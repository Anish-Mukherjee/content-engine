// src/integrations/frontend/index.ts
import { logger } from '../../lib/logger';

export async function revalidate(paths: string[]): Promise<void> {
  const base = process.env.FRONTEND_BASE_URL ?? '';
  const secret = process.env.FRONTEND_REVALIDATE_SECRET ?? '';
  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-token': secret },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) logger.warn({ status: res.status, paths }, 'revalidate non-2xx (soft-fail)');
  } catch (err) {
    logger.warn({ err, paths }, 'revalidate call failed (soft-fail)');
  }
}
