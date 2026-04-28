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
    GOOGLE_SERVICE_ACCOUNT_JSON_PATH: './g.json',
    FRONTEND_BASE_URL: 'https://xerogravity.com',
    FRONTEND_REVALIDATE_SECRET: 's',
    ADMIN_API_KEY: 'a',
  };

  it('parses required env and applies defaults', () => {
    const parsed = parseEnv(baseEnv);
    expect(parsed.PORT).toBe(4000);
    expect(parsed.LOG_LEVEL).toBe('info');
    expect(parsed.PUBLISH_HOURS_UTC).toEqual([9]);
    expect(parsed.DISABLE_CRON).toBe(false);
    expect(parsed.WEBHOOK_URL).toBeUndefined();
  });

  it('parses PUBLISH_HOURS_UTC as a sorted, deduped list of hours', () => {
    expect(parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '9,21' }).PUBLISH_HOURS_UTC).toEqual([9, 21]);
    expect(parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '21, 9' }).PUBLISH_HOURS_UTC).toEqual([9, 21]);
    expect(parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '9, 9, 21' }).PUBLISH_HOURS_UTC).toEqual([9, 21]);
    expect(parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '7' }).PUBLISH_HOURS_UTC).toEqual([7]);
  });

  it('rejects PUBLISH_HOURS_UTC values outside 0-23', () => {
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '9,24' })).toThrow(/PUBLISH_HOURS_UTC/);
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '-1' })).toThrow(/PUBLISH_HOURS_UTC/);
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: 'morning' })).toThrow(/PUBLISH_HOURS_UTC/);
    expect(() => parseEnv({ ...baseEnv, PUBLISH_HOURS_UTC: '' })).toThrow(/PUBLISH_HOURS_UTC/);
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
