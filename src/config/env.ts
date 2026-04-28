// src/config/env.ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  PERPLEXITY_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  UNSPLASH_ACCESS_KEY: z.string().min(1),
  FREEPIK_API_KEY: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: z.string().min(1),

  FRONTEND_BASE_URL: z.string().url(),
  FRONTEND_REVALIDATE_SECRET: z.string().min(1),

  ADMIN_API_KEY: z.string().min(1),
  WEBHOOK_URL: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),

  // The single UTC hour (0-23) at which all daily articles publish.
  PUBLISH_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(9),

  // How many articles to drive (and publish) per UTC day. The scheduler
  // calls driveArticle this many times per cron tick; all of them queue
  // for the same next-PUBLISH_HOUR_UTC slot, so they go live together.
  ARTICLES_PER_DAY: z.coerce.number().int().min(1).max(20).default(1),
  DISABLE_CRON: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${missing}`);
  }
  return result.data;
}

let cachedEnv: Env | null = null;
export function env(): Env {
  if (!cachedEnv) cachedEnv = parseEnv(process.env);
  return cachedEnv;
}
