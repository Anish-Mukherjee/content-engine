// src/config/env.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    DATAFORSEO_LOGIN: 'l',
    DATAFORSEO_PASSWORD: 'p',
    PERPLEXITY_API_KEY: 'k',
    ANTHROPIC_API_KEY: 'k',
    UNSPLASH_ACCESS_KEY: 'k',
    FREEPIK_API_KEY: 'k',
    PEXELS_API_KEY: 'k',
    PIXABAY_API_KEY: 'k',
    GOOGLE_SERVICE_ACCOUNT_JSON_PATH: './g.json',
    FRONTEND_BASE_URL: 'https://xerogravity.com',
    FRONTEND_REVALIDATE_SECRET: 's',
    ADMIN_API_KEY: 'a',
  };

  it('parses required env and applies defaults', () => {
    const parsed = parseEnv(baseEnv);
    expect(parsed.PORT).toBe(4000);
    expect(parsed.LOG_LEVEL).toBe('info');
    expect(parsed.PUBLISH_HOUR_UTC).toBe(9);
    expect(parsed.ARTICLES_PER_DAY).toBe(1);
    expect(parsed.DISABLE_CRON).toBe(false);
    expect(parsed.WEBHOOK_URL).toBeUndefined();
  });

  it('coerces PUBLISH_HOUR_UTC and ARTICLES_PER_DAY from strings', () => {
    const parsed = parseEnv({ ...baseEnv, PUBLISH_HOUR_UTC: '3', ARTICLES_PER_DAY: '2' });
    expect(parsed.PUBLISH_HOUR_UTC).toBe(3);
    expect(parsed.ARTICLES_PER_DAY).toBe(2);
  });

  it('rejects out-of-range PUBLISH_HOUR_UTC and ARTICLES_PER_DAY', () => {
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOUR_UTC: '24' })).toThrow(/PUBLISH_HOUR_UTC/);
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOUR_UTC: '-1' })).toThrow(/PUBLISH_HOUR_UTC/);
    expect(() => parseEnv({ ...baseEnv, ARTICLES_PER_DAY: '0' })).toThrow(/ARTICLES_PER_DAY/);
    expect(() => parseEnv({ ...baseEnv, ARTICLES_PER_DAY: '21' })).toThrow(/ARTICLES_PER_DAY/);
  });

  it('throws when a required var is missing', () => {
    const env = { ...baseEnv };
    delete (env as Record<string, string>).DATABASE_URL;
    expect(() => parseEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('coerces numeric and boolean env', () => {
    const parsed = parseEnv({ ...baseEnv, PORT: '5000', DISABLE_CRON: 'true' });
    expect(parsed.PORT).toBe(5000);
    expect(parsed.DISABLE_CRON).toBe(true);
  });
});
