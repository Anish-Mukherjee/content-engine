// src/server/routes/articles.ts
import { Router } from 'express';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

import { db } from '../../db/client';
import { articles } from '../../db/schema';
import { isCategory } from '../../config/categories';

export const articlesRouter = Router();

const PUBLIC_FIELDS = {
  id: articles.id,
  keyword: articles.keyword,
  category: articles.category,
  title: articles.title,
  slug: articles.slug,
  metaTitle: articles.metaTitle,
  metaDescription: articles.metaDescription,
  secondaryKeywords: articles.secondaryKeywords,
  articleHtml: articles.articleHtml,
  wordCount: articles.wordCount,
  estimatedReadTime: articles.estimatedReadTime,
  heroImage: articles.heroImage,
  faqSchema: articles.faqSchema,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
};

articlesRouter.get('/api/articles', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const category = typeof req.query.category === 'string' && isCategory(req.query.category)
    ? req.query.category
    : null;

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

  const conditions: SQL[] = [eq(articles.status, 'published')];
  if (category) conditions.push(eq(articles.category, category));
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const orExpr = or(ilike(articles.title, pattern), ilike(articles.keyword, pattern));
    if (orExpr) conditions.push(orExpr);
  }
  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db().select(PUBLIC_FIELDS).from(articles).where(where)
      .orderBy(desc(articles.publishedAt)).limit(limit).offset(offset),
    db().select({ value: count() }).from(articles).where(where),
  ]);

  res.json({ articles: rows, page, limit, total: totalRows[0]?.value ?? 0 });
});

articlesRouter.get('/api/articles/:slug', async (req, res) => {
  const [row] = await db()
    .select(PUBLIC_FIELDS)
    .from(articles)
    .where(and(eq(articles.slug, req.params.slug), eq(articles.status, 'published')))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(row);
});

articlesRouter.get('/api/sitemap-data', async (_req, res) => {
  const rows = await db()
    .select({
      slug: articles.slug,
      updatedAt: articles.updatedAt,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt));
  res.json({ articles: rows });
});
