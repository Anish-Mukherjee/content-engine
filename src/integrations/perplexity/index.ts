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
  if (parsed) return validateBrief(parsed);

  const second = await chatCompletion({
    system: perplexityResearchSystem(brand),
    user:
      perplexityResearchUser(keyword) +
      '\n\nReturn ONLY raw JSON. No prose, no markdown, no backticks. The response must start with { and end with }.',
  });
  const reparsed = tryParseBrief(second);
  if (reparsed) return validateBrief(reparsed);

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
