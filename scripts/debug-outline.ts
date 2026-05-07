// scripts/debug-outline.ts — one-shot diagnostic: re-run the outline call for an
// article and log the raw Claude response so we can see why JSON parse fails.
import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db, closeDb } from '../src/db/client';
import { articles } from '../src/db/schema';
import { anthropic } from '../src/integrations/claude/client';
import { MODELS } from '../src/config/models';
import { claudeOutlineSystem, claudeOutlineUser } from '../src/config/prompts';
import { BRAND } from '../src/config/brand';
import type { PerplexityBrief } from '../src/integrations/perplexity/types';

async function main() {
  const articleId = process.argv[2];
  if (!articleId) {
    console.error('usage: tsx scripts/debug-outline.ts <articleId>');
    process.exit(1);
  }
  const [article] = await db().select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!article || !article.perplexityBrief) {
    console.error('article or brief missing');
    process.exit(1);
  }
  const brief = article.perplexityBrief as PerplexityBrief;

  const resp = await anthropic().messages.create({
    model: MODELS.outline,
    max_tokens: 6000,
    system: claudeOutlineSystem(BRAND),
    messages: [{
      role: 'user',
      content: claudeOutlineUser({
        keyword: article.keyword,
        searchVolume: article.searchVolume,
        brief,
      }),
    }],
  });

  const text = (resp.content.find((c) => c.type === 'text') as { text?: string })?.text ?? '';

  console.log('=== model ===', MODELS.outline);
  console.log('=== stop_reason ===', resp.stop_reason);
  console.log('=== usage ===', JSON.stringify(resp.usage));
  console.log('=== raw length ===', text.length);
  console.log('=== first 800 chars ===');
  console.log(text.slice(0, 800));
  console.log('=== last 800 chars ===');
  console.log(text.slice(-800));

  let cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (cleaned && cleaned[0] !== '{' && cleaned[0] !== '[') {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) cleaned = match[1];
  }
  console.log('=== cleaned length ===', cleaned.length);
  try {
    JSON.parse(cleaned);
    console.log('=== parse OK ===');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('=== parse FAILED ===', msg);
    const m = msg.match(/position (\d+)/);
    if (m) {
      const pos = parseInt(m[1], 10);
      console.log(`--- around position ${pos} ---`);
      console.log(JSON.stringify(cleaned.slice(Math.max(0, pos - 120), pos + 120)));
    }
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
