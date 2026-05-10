-- Seed the XeroGravity tenant and backfill site_id on existing pipeline rows.
-- Idempotent: re-running this script is a no-op once the tenant and backfill exist.
--
-- Run via:
--   psql "$DATABASE_URL" -f scripts/seed-xg-and-backfill.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_id    text;
  v_site_id   uuid;
  v_categories jsonb;
BEGIN
  -- 1a. Upsert the XeroGravity organization
  INSERT INTO organization (id, name, slug, metadata, created_at)
  VALUES (
    gen_random_uuid()::text,
    'XeroGravity',
    'xerogravity',
    '{"isInternal":true,"description":"Original Suprero pipeline tenant"}'::jsonb,
    now()
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organization WHERE slug = 'xerogravity';
  RAISE NOTICE 'XG org id: %', v_org_id;

  -- 1b. Pull canonical categories from existing seed_keywords
  SELECT COALESCE(jsonb_agg(DISTINCT category ORDER BY category), '[]'::jsonb)
  INTO v_categories
  FROM seed_keywords
  WHERE category IS NOT NULL;
  RAISE NOTICE 'XG categories: %', v_categories;

  -- 1c. Upsert the canonical site
  INSERT INTO site (
    organization_id, name, slug, categories, default_category,
    publishing_mode, schedule_enabled, target_word_count, created_at, updated_at
  )
  VALUES (
    v_org_id, 'XeroGravity', 'xerogravity', v_categories, 'concepts',
    'auto_publish', true, 1500, now(), now()
  )
  ON CONFLICT (organization_id, slug) DO NOTHING;

  SELECT id INTO v_site_id FROM site WHERE organization_id = v_org_id AND slug = 'xerogravity';
  RAISE NOTICE 'XG site id: %', v_site_id;

  -- 2. Backfill site_id on all 5 pipeline tables (only NULL rows)
  UPDATE articles         SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE seed_keywords    SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE keyword_results  SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE dataforseo_tasks SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE image_usage      SET site_id = v_site_id WHERE site_id IS NULL;
END $$;

-- 3. Final report — total = with_id means every row backfilled
SELECT 'articles'         AS t, count(*) AS total, count(site_id) AS with_id FROM articles
UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;

COMMIT;
