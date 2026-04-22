// src/integrations/claude/index.ts
import type { BrandConfig } from '../../config/brand';
import { MODELS } from '../../config/models';
import {
  claudeArticleSystem, claudeArticleUser,
  claudeOutlineSystem, claudeOutlineUser,
  claudeRelevanceSystem, claudeRelevanceUser,
} from '../../config/prompts';
import { TerminalError } from '../../lib/errors';
import { anthropic } from './client';
import type { ArticleOutline } from './types';

type ArticleRowShape = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  secondaryKeywords?: string[];
};

export async function checkRelevance(
  keywords: string[],
  brand: BrandConfig,
): Promise<boolean[]> {
  const resp = await anthropic().messages.create({
    model: MODELS.relevance,
    max_tokens: 500,
    system: claudeRelevanceSystem(brand),
    messages: [{ role: 'user', content: claudeRelevanceUser(keywords) }],
  });
  const text = extractText(resp);
  const arr = tryJson(text);
  if (!Array.isArray(arr) || arr.length !== keywords.length) {
    throw new TerminalError('claude relevance: array length mismatch');
  }
  return arr.map((v) => String(v).toUpperCase().startsWith('Y'));
}

export async function generateOutline(
  article: ArticleRowShape,
  brief: unknown,
  brand: BrandConfig,
): Promise<ArticleOutline> {
  const resp = await anthropic().messages.create({
    model: MODELS.outline,
    max_tokens: 1500,
    system: claudeOutlineSystem(brand),
    messages: [{
      role: 'user',
      content: claudeOutlineUser({
        keyword: article.keyword,
        searchVolume: article.searchVolume,
        brief,
      }),
    }],
  });
  const text = extractText(resp);
  const parsed = tryJson(text);
  if (!parsed || typeof parsed !== 'object' || !('title' in parsed) || !('slug' in parsed) || !('outline' in parsed)) {
    throw new TerminalError('claude outline: invalid JSON structure');
  }
  return parsed as ArticleOutline;
}

export async function writeArticleBody(
  article: { keyword: string; secondaryKeywords: string[] | null },
  outline: ArticleOutline,
  brief: { key_terms_to_include: string[]; recent_developments: string[] },
  brand: BrandConfig,
): Promise<string> {
  const resp = await anthropic().messages.create({
    model: MODELS.article,
    max_tokens: 4000,
    system: claudeArticleSystem(brand),
    messages: [{
      role: 'user',
      content: claudeArticleUser({
        keyword: article.keyword,
        secondaryKeywords: article.secondaryKeywords ?? [],
        outline: outline.outline,
        brief,
        ctaPlacement: outline.cta_placement,
        ctaHtml: brand.ctaHtml,
        wordCount: outline.word_count,
        searchIntent: outline.search_intent,
        audience: outline.target_audience,
      }),
    }],
  });
  const text = extractText(resp);
  if (!text || !text.trim().startsWith('<')) {
    throw new TerminalError('claude article: response did not start with HTML tag');
  }
  return text;
}

function extractText(resp: { content: Array<{ type: string; text?: string }> }): string {
  const block = resp.content.find((c) => c.type === 'text');
  return block?.text ?? '';
}

function tryJson(raw: string): unknown {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new TerminalError('claude: JSON parse failed');
  }
}

// Rate-limit 429 handling: Anthropic SDK throws errors with .status.
// Wrap specific calls in the driver; we surface as TransientError.
export function isTransientClaudeError(err: unknown): boolean {
  const anyErr = err as { status?: number };
  return typeof anyErr.status === 'number' && (anyErr.status === 429 || anyErr.status >= 500);
}
