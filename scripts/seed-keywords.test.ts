// scripts/seed-keywords.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client';
import { seedKeywords } from '../src/db/schema';
import { importSeedKeywords } from './seed-keywords';

describe('importSeedKeywords', () => {
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE seed_keywords CASCADE`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('inserts every keyword under its category', async () => {
    const payload = {
      exchanges: ['foo', 'bar'],
      patterns: ['baz'],
    };
    await importSeedKeywords(payload);
    const rows = await db().select().from(seedKeywords);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.keyword).sort()).toEqual(['bar', 'baz', 'foo']);
  });

  it('is idempotent — re-running does not duplicate', async () => {
    const payload = { exchanges: ['foo'] };
    await importSeedKeywords(payload);
    await importSeedKeywords(payload);
    const rows = await db().select().from(seedKeywords);
    expect(rows).toHaveLength(1);
  });
});
