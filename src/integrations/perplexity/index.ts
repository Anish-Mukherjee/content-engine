// src/integrations/perplexity/index.ts
import type { BrandConfig } from '../../config/brand';
import { perplexityResearchSystem, perplexityResearchUser } from '../../config/prompts';
import { TerminalError } from '../../lib/errors';
import { chatCompletion } from './client';
import type { PerplexityBrief } from './types';

const REQUIRED_FIELDS = [
  'keyword',
  'search_intent',
  'target_audience',
  'top_3_competitors',
  'winning_angle',
  'unique_hook',
  'content_gaps',
  'questions_to_answer',
  'recommended_title',
  'recommended_h2s',
  'faq_questions',
] as const;

export async function researchKeyword(keyword: string, brand: BrandConfig): Promise<PerplexityBrief> {
  const first = await chatCompletion({
    system: perplexityResearchSystem(brand),
    user: perplexityResearchUser(keyword),
  });
  const parsed = tryParseBrief(first);
  if (parsed) return validateBrief(normalizeBrief(parsed));

  const second = await chatCompletion({
    system: perplexityResearchSystem(brand),
    user:
      perplexityResearchUser(keyword) +
      '\n\nReturn ONLY raw JSON. No prose, no markdown, no backticks. The response must start with { and end with }.',
  });
  const reparsed = tryParseBrief(second);
  if (reparsed) return validateBrief(normalizeBrief(reparsed));

  throw new TerminalError('perplexity returned non-JSON twice');
}

function tryParseBrief(raw: string): PerplexityBrief | null {
  const stripped = stripCodeFence(raw).trim();
  try {
    const obj = JSON.parse(stripped);
    if (typeof obj === 'object' && obj !== null && typeof obj.keyword === 'string') {
      return obj as PerplexityBrief;
    }
    return null;
  } catch {
    return null;
  }
}

// Coerce missing/malformed array+string fields to safe defaults. Perplexity
// occasionally omits per-competitor fields (e.g. `weaknesses`) — without this
// the prompt builders blow up on `.join`/`.map` of undefined and the article
// dies at the write stage with no recovery.
function normalizeBrief(brief: PerplexityBrief): PerplexityBrief {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

  const competitors = Array.isArray(brief.top_3_competitors)
    ? brief.top_3_competitors.map((c) => {
        const raw = (c ?? {}) as Record<string, unknown>;
        return {
          title: str(raw.title),
          url: str(raw.url),
          strengths: arr(raw.strengths),
          weaknesses: arr(raw.weaknesses),
          word_count: num(raw.word_count, 0),
          tone: str(raw.tone),
        };
      })
    : [];

  return {
    ...brief,
    top_3_competitors: competitors,
    content_gaps: arr(brief.content_gaps),
    questions_to_answer: arr(brief.questions_to_answer),
    key_stats_to_include: arr((brief as Record<string, unknown>).key_stats_to_include),
    recommended_h2s: arr(brief.recommended_h2s),
    key_terms_to_include: arr((brief as Record<string, unknown>).key_terms_to_include),
    faq_questions: arr(brief.faq_questions),
  };
}

function validateBrief(brief: PerplexityBrief): PerplexityBrief {
  for (const field of REQUIRED_FIELDS) {
    const value = brief[field];
    if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
      throw new TerminalError(`perplexity brief missing required field: ${field}`);
    }
  }
  return brief;
}

function stripCodeFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
}
