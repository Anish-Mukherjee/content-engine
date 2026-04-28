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

  // Comma-separated list of UTC hours (0-23) at which articles publish.
  // 1 hour = 1 article/day; 2 hours = 2/day, etc. Slots are filled in
  // chronological order by `getNextSlot` (queue-article.ts).
  PUBLISH_HOURS_UTC: z
    .string()
    .default('9')
    .transform((raw, ctx) => {
      const tokens = raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      if (tokens.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PUBLISH_HOURS_UTC: must contain at least one hour' });
        return z.NEVER;
      }
      const hours: number[] = [];
      for (const t of tokens) {
        const n = Number(t);
        if (!Number.isInteger(n) || n < 0 || n > 23) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `PUBLISH_HOURS_UTC: invalid hour "${t}" (expected integer 0-23)` });
          return z.NEVER;
        }
        hours.push(n);
      }
      return [...new Set(hours)].sort((a, b) => a - b);
    }),
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
