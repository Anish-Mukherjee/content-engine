// src/db/schema.ts
import {
  pgTable, uuid, text, integer, real, timestamp, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const seedKeywords = pgTable('seed_keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyword: text('keyword').notNull(),
  category: text('category').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  timesUsed: integer('times_used').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxSeedRotation: index('idx_seed_rotation').on(t.category, t.lastUsedAt),
  uniqKeywordCategory: uniqueIndex('uniq_seed_kw_cat').on(t.keyword, t.category),
}));

export const dataforseoTasks = pgTable('dataforseo_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalTaskId: text('external_task_id').notNull().unique(),
  seedKeywordId: uuid('seed_keyword_id').notNull().references(() => seedKeywords.id),
  status: text('status').notNull(),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  retrievedAt: timestamp('retrieved_at'),
  resultCount: integer('result_count'),
  error: text('error'),
}, (t) => ({
  idxPending: index('idx_dfs_pending').on(t.status),
}));

export const keywordResults = pgTable('keyword_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyword: text('keyword').notNull(),
  category: text('category').notNull(),
  seedKeywordId: uuid('seed_keyword_id').notNull().references(() => seedKeywords.id),
  dataforseoTaskId: uuid('dataforseo_task_id').notNull().references(() => dataforseoTasks.id),
  searchVolume: integer('search_volume'),
  competition: real('competition'),
  cpc: real('cpc'),
  keywordDifficulty: integer('keyword_difficulty'),
  trend: text('trend'),
  status: text('status').notNull(),
  filterReason: text('filter_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
}, (t) => ({
  idxKeyword: index('idx_kr_keyword').on(t.keyword),
  idxStatus: index('idx_kr_status').on(t.status),
}));

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  keywordResultId: uuid('keyword_result_id').references(() => keywordResults.id),
  keyword: text('keyword').notNull(),
  category: text('category').notNull(),

  searchVolume: integer('search_volume'),
  competition: real('competition'),
  cpc: real('cpc'),

  status: text('status').notNull(),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),

  perplexityBrief: jsonb('perplexity_brief'),
  outline: jsonb('outline'),
  title: text('title'),
  slug: text('slug'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  secondaryKeywords: jsonb('secondary_keywords'),
  articleHtml: text('article_html'),
  wordCount: integer('word_count'),
  estimatedReadTime: text('estimated_read_time'),
  heroImage: jsonb('hero_image'),
  faqSchema: jsonb('faq_schema'),

  scheduledAt: timestamp('scheduled_at'),
  publishedAt: timestamp('published_at'),

  researchedAt: timestamp('researched_at'),
  outlinedAt: timestamp('outlined_at'),
  writtenAt: timestamp('written_at'),
  imageFetchedAt: timestamp('image_fetched_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxStatus: index('idx_art_status').on(t.status),
  idxSlug: uniqueIndex('idx_art_slug').on(t.slug),
  idxScheduled: index('idx_art_scheduled').on(t.scheduledAt),
  idxPublished: index('idx_art_published').on(t.publishedAt),
}));
