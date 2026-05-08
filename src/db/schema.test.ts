import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, closeDb } from './client';

describe('schema 0003 — additive multi-tenant tables', () => {
  beforeAll(async () => {
    // Force connection on the singleton.
    await db().execute(sql`select 1`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('creates Better Auth core tables', async () => {
    const tables = await db().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      and table_name in ('user','session','account','verification')
      order by table_name
    `);
    expect(tables.map((r) => r.table_name).sort()).toEqual(
      ['account', 'session', 'user', 'verification']
    );
  });

  it('creates Better Auth organizations plugin tables', async () => {
    const tables = await db().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      and table_name in ('organization','member','invitation')
      order by table_name
    `);
    expect(tables.map((r) => r.table_name).sort()).toEqual(
      ['invitation', 'member', 'organization']
    );
  });

  it('creates Suprero site and api_call_log tables', async () => {
    const tables = await db().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      and table_name in ('site','api_call_log')
      order by table_name
    `);
    expect(tables.map((r) => r.table_name).sort()).toEqual(
      ['api_call_log', 'site']
    );
  });

  it('adds nullable site_id column to all existing pipeline tables', async () => {
    const expected = ['articles','seed_keywords','keyword_results','dataforseo_tasks','image_usage'];
    for (const t of expected) {
      const rows = await db().execute<{ is_nullable: string }>(sql`
        select is_nullable from information_schema.columns
        where table_schema='public' and table_name=${t} and column_name='site_id'
      `);
      expect(rows.length, `expected site_id column on ${t}`).toBe(1);
      expect(rows[0]!.is_nullable, `${t}.site_id must still be nullable in plan 1`).toBe('YES');
    }
  });

  it('does NOT yet add a foreign key from articles.site_id to site.id (deferred to plan 4)', async () => {
    const rows = await db().execute<{ constraint_name: string }>(sql`
      select tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
      where tc.table_name = 'articles'
        and kcu.column_name = 'site_id'
        and tc.constraint_type = 'FOREIGN KEY'
    `);
    expect(rows.length).toBe(0);
  });
});
