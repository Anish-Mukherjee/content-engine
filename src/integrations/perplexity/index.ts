// src/integrations/perplexity/index.ts
import type { BrandConfig } from '../../config/brand';
import { perplexityResearchSystem, perplexityResearchUser } from '../../config/prompts';
import { TerminalError } from '../../lib/errors';
import { chatCompletion } from './client';
import type { PerplexityBrief } from './types';

export async function researchKeyword(keyword: string, brand: BrandConfig): Promise<PerplexityBrief> {
  const first = await chatCompletion({
    system: perplexityResearchSystem(brand),
    user: perplexityResearchUser(keyword),
  });
  const parsed = tryParseBrief(first);
  if (parsed) return parsed;

  const second = await chatCompletion({
    system: perplexityResearchSystem(brand),
    user:
      perplexityResearchUser(keyword) +
      '\n\nReturn ONLY raw JSON. No prose, no markdown, no backticks. The response must start with { and end with }.',
  });
  const reparsed = tryParseBrief(second);
  if (reparsed) return reparsed;

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

function stripCodeFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
}
