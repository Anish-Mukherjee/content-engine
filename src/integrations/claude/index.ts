// src/integrations/claude/index.ts
import type { BrandConfig } from '../../config/brand';
import { MODELS } from '../../config/models';
import {
  claudeArticleSystem, claudeArticleUser,
  claudeOutlineSystem, claudeOutlineUser,
  claudeRelevanceSystem, claudeRelevanceUser,
} from '../../config/prompts';
import { TerminalError } from '../../lib/errors';
import type { PerplexityBrief } from '../perplexity/types';
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
  if (!Array.isArray(arr)) {
    throw new TerminalError('claude relevance: response is not an array');
  }
  // Tolerate length drift: if Claude returns fewer items, missing ones default to
  // "not approved" (safe). If it returns more, ignore the overflow.
  const verdicts: boolean[] = [];
  for (let i = 0; i < keywords.length; i++) {
    verdicts.push(i < arr.length ? String(arr[i]).toUpperCase().startsWith('Y') : false);
  }
  return verdicts;
}

export async function generateOutline(
  article: ArticleRowShape,
  brief: PerplexityBrief,
  brand: BrandConfig,
): Promise<ArticleOutline> {
  const resp = await anthropic().messages.create({
    model: MODELS.outline,
    max_tokens: 3000,
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
  brief: PerplexityBrief,
  brand: BrandConfig,
): Promise<string> {
  const resp = await anthropic().messages.create({
    model: MODELS.article,
    max_tokens: 8000,
    system: claudeArticleSystem(brand),
    messages: [{
      role: 'user',
      content: claudeArticleUser({
        keyword: article.keyword,
        secondaryKeywords: article.secondaryKeywords ?? [],
        outline,
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
  // First pass: strip markdown code fence wrappers if present.
  let cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // Second pass: if Claude prefaced or trailed the JSON with prose, extract the
  // first {...} or [...] block.
  if (cleaned && cleaned[0] !== '{' && cleaned[0] !== '[') {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) cleaned = match[1];
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new TerminalError('claude: JSON parse failed');
  }
}

// Returns true for errors the driver should treat as transient and retry.
// Covers: HTTP 429, HTTP 5xx, and Anthropic SDK connection/timeout errors.
export function isTransientClaudeError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true;
  const anyErr = err as { status?: number };
  return typeof anyErr.status === 'number' && (anyErr.status === 429 || anyErr.status >= 500);
}
