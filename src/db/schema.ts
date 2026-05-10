// src/db/schema.ts
import {
  pgTable, uuid, text, integer, real, timestamp, jsonb, index, uniqueIndex, boolean,
} from 'drizzle-orm/pg-core';

export const seedKeywords = pgTable('seed_keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id'), // NULL until Plan 4 backfill; no FK yet
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
  siteId: uuid('site_id'), // NULL until Plan 4 backfill; no FK yet
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
  siteId: uuid('site_id'), // NULL until Plan 4 backfill; no FK yet
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
  siteId: uuid('site_id'), // NULL until Plan 4 backfill; no FK yet
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

export const imageUsage = pgTable('image_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id'), // NULL until Plan 4 backfill; no FK yet
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                  // 'hero' | 'inline'
  position: integer('position'),                  // null for hero, 1..N for inline
  url: text('url').notNull(),                     // /images/foo-hero.jpg
  source: text('source').notNull(),               // 'unsplash' | 'freepik' | 'wikimedia' | 'legacy'
  sourceId: text('source_id'),                    // upstream id; null for legacy/unknown
  contentHash: text('content_hash').notNull(),    // sha256 hex of saved JPEG bytes
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxSource: index('idx_iu_source').on(t.source, t.sourceId),
  idxHash: index('idx_iu_hash').on(t.contentHash),
  idxArticle: index('idx_iu_article').on(t.articleId),
}));

// ─────────────────────────────────────────────────────────────────
// Better Auth — core tables
// (text IDs are Better Auth's default; we keep them for ergonomic SDK use)
// ─────────────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxUserId: index('idx_session_user').on(t.userId),
}));

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxUserProvider: uniqueIndex('uniq_account_user_provider').on(t.userId, t.providerId),
}));

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxIdentifier: index('idx_verification_identifier').on(t.identifier),
}));

// ─────────────────────────────────────────────────────────────────
// Better Auth — organizations plugin
// ─────────────────────────────────────────────────────────────────

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqOrgUser: uniqueIndex('uniq_member_org_user').on(t.organizationId, t.userId),
  idxOrg: index('idx_member_org').on(t.organizationId),
  idxUser: index('idx_member_user').on(t.userId),
}));

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(), // 'pending' | 'accepted' | 'expired' | 'cancelled'
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: text('inviter_id').notNull().references(() => user.id),
}, (t) => ({
  idxOrgEmail: index('idx_invitation_org_email').on(t.organizationId, t.email),
  idxStatus: index('idx_invitation_status').on(t.status),
}));

// ─────────────────────────────────────────────────────────────────
// Suprero-specific tables
// ─────────────────────────────────────────────────────────────────

export const site = pgTable('site', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  categories: jsonb('categories').notNull().default([]),
  defaultCategory: text('default_category'),
  publishingMode: text('publishing_mode').notNull().default('draft_only'),
  scheduleEnabled: boolean('schedule_enabled').notNull().default(true),
  targetWordCount: integer('target_word_count').notNull().default(1500),
  toneOfVoice: text('tone_of_voice'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqOrgSlug: uniqueIndex('uniq_site_org_slug').on(t.organizationId, t.slug),
  idxOrg: index('idx_site_org').on(t.organizationId),
}));

export const apiCallLog = pgTable('api_call_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => site.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'dataforseo' | 'anthropic' | 'perplexity' | 'unsplash' | 'freepik' | 'pexels' | 'pixabay'
  costEstimateUsd: real('cost_estimate_usd'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxProviderTime: index('idx_acl_provider_time').on(t.provider, t.createdAt),
  idxSiteTime: index('idx_acl_site_time').on(t.siteId, t.createdAt),
}));
