// scripts/dedupe-pending-articles.ts
//
// Apply token-set signature dedup to in-flight articles. Candidates are every
// article that hasn't published yet (pending, researching, researched,
// outlining, outlined, writing, written, fetching_image, image_ready,
// scheduled, plus *_failed states). Within candidates, rows are clustered
// by signature; the most-progressed row in each cluster wins, the rest are
// cancelled. Any candidate whose signature matches an already-published
// article is also cancelled.
//
// Default scope is `active` (all in-flight). Pass `--scope=pending` to
// restrict to status='pending' only (matches the original behaviour).
//
//   npm run dedupe:pending -- --dry-run
//   npm run dedupe:pending -- --apply
//   npm run dedupe:pending -- --apply --scope=pending
//
import 'dotenv/config';

import { eq, inArray, sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import { db, closeDb } from '../src/db/client';
import { articles } from '../src/db/schema';
import { signature } from '../src/lib/keyword-signature';

type Article = typeof articles.$inferSelect;

export type DedupeScope = 'pending' | 'active';

export type DedupePlan = {
  keep: Array<{
    id: string;
    keyword: string;
    category: string;
    status: string;
    signature: string;
    searchVolume: number | null;
  }>;
  cancel: Array<{
    id: string;
    keyword: string;
    category: string;
    status: string;
    signature: string;
    searchVolume: number | null;
    reason: string;
    keptKeyword: string;
  }>;
};

// Higher = more pipeline progress = more sunk cost = better keeper. Failed
// states rank below their successful step (a write_failed loses to a written).
const PROGRESS_RANK: Record<string, number> = {
  pending: 0,
  research_failed: 1,
  researching: 2,
  researched: 3,
  outline_failed: 4,
  outlining: 5,
  outlined: 6,
  write_failed: 7,
  writing: 8,
  written: 9,
  image_failed: 10,
  fetching_image: 11,
  image_ready: 12,
  queue_failed: 13,
  scheduled: 14,
};

function progressRank(status: string): number {
  return PROGRESS_RANK[status] ?? -1;
}

function pickRepresentative(rows: Article[]): Article {
  // 1) Most-progressed status wins (don't throw away research/write/image work).
  // 2) Highest search_volume.
  // 3) Oldest createdAt.
  return [...rows].sort((a, b) => {
    const pr = progressRank(b.status) - progressRank(a.status);
    if (pr !== 0) return pr;
    const sv = (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    if (sv !== 0) return sv;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

export function buildDedupePlan(candidates: Article[], occupied: Article[]): DedupePlan {
  // Map signatures held by occupied (published) rows → representative keyword.
  const occupiedSig = new Map<string, string>();
  for (const a of occupied) {
    const sig = signature(a.keyword);
    if (!sig) continue;
    if (!occupiedSig.has(sig)) occupiedSig.set(sig, a.keyword);
  }

  const groups = new Map<string, Article[]>();
  const sigless: Article[] = [];
  for (const a of candidates) {
    const sig = signature(a.keyword);
    if (!sig) {
      sigless.push(a);
      continue;
    }
    const list = groups.get(sig) ?? [];
    list.push(a);
    groups.set(sig, list);
  }

  const plan: DedupePlan = { keep: [], cancel: [] };

  for (const [sig, rows] of groups) {
    const occupiedKw = occupiedSig.get(sig);
    if (occupiedKw) {
      // Whole cluster collides with an existing published article.
      for (const r of rows) {
        plan.cancel.push({
          id: r.id, keyword: r.keyword, category: r.category, status: r.status, signature: sig,
          searchVolume: r.searchVolume,
          reason: 'duplicate_signature: existing_article',
          keptKeyword: occupiedKw,
        });
      }
      continue;
    }
    const keeper = pickRepresentative(rows);
    plan.keep.push({
      id: keeper.id, keyword: keeper.keyword, category: keeper.category, status: keeper.status,
      signature: sig, searchVolume: keeper.searchVolume,
    });
    for (const r of rows) {
      if (r.id === keeper.id) continue;
      plan.cancel.push({
        id: r.id, keyword: r.keyword, category: r.category, status: r.status, signature: sig,
        searchVolume: r.searchVolume,
        reason: 'duplicate_signature: active_cluster',
        keptKeyword: keeper.keyword,
      });
    }
  }

  for (const r of sigless) {
    plan.keep.push({
      id: r.id, keyword: r.keyword, category: r.category, status: r.status, signature: '',
      searchVolume: r.searchVolume,
    });
  }

  return plan;
}

const ACTIVE_STATUSES = [
  'pending', 'researching', 'researched', 'outlining', 'outlined',
  'writing', 'written', 'fetching_image', 'image_ready', 'scheduled',
  'research_failed', 'outline_failed', 'write_failed', 'image_failed', 'queue_failed',
];

export async function dedupeActive(opts: { apply: boolean; scope?: DedupeScope }): Promise<DedupePlan> {
  const scope = opts.scope ?? 'active';
  const candidateStatuses = scope === 'pending' ? ['pending'] : ACTIVE_STATUSES;

  const candidates = await db().select().from(articles).where(
    inArray(articles.status, candidateStatuses),
  );
  const occupied = await db().select().from(articles).where(eq(articles.status, 'published'));

  const plan = buildDedupePlan(candidates, occupied);
  if (!opts.apply) return plan;

  for (const c of plan.cancel) {
    await db().update(articles).set({
      status: 'cancelled',
      lastError: `${c.reason} (kept "${c.keptKeyword}")`,
    }).where(eq(articles.id, c.id));
  }
  return plan;
}

function parseScope(args: string[]): DedupeScope {
  for (const a of args) {
    if (a === '--scope=pending') return 'pending';
    if (a === '--scope=active') return 'active';
  }
  return 'active';
}

function summarise(plan: DedupePlan, scope: DedupeScope): string {
  const byStatus = new Map<string, { keep: number; cancel: number }>();
  const byCategory = new Map<string, { keep: number; cancel: number }>();
  for (const k of plan.keep) {
    const cat = byCategory.get(k.category) ?? { keep: 0, cancel: 0 };
    cat.keep++;
    byCategory.set(k.category, cat);
    const st = byStatus.get(k.status) ?? { keep: 0, cancel: 0 };
    st.keep++;
    byStatus.set(k.status, st);
  }
  for (const c of plan.cancel) {
    const cat = byCategory.get(c.category) ?? { keep: 0, cancel: 0 };
    cat.cancel++;
    byCategory.set(c.category, cat);
    const st = byStatus.get(c.status) ?? { keep: 0, cancel: 0 };
    st.cancel++;
    byStatus.set(c.status, st);
  }

  const lines: string[] = [];
  lines.push(`Dedup plan (scope=${scope}) by category — keep / cancel:`);
  for (const [cat, e] of [...byCategory.entries()].sort()) {
    lines.push(`  ${cat.padEnd(12)} ${(e.keep + e.cancel).toString().padStart(4)} → keep ${e.keep.toString().padStart(3)}, cancel ${e.cancel.toString().padStart(3)}`);
  }
  lines.push('');
  lines.push('By source status — keep / cancel:');
  for (const [st, e] of [...byStatus.entries()].sort()) {
    lines.push(`  ${st.padEnd(18)} keep ${e.keep.toString().padStart(3)}, cancel ${e.cancel.toString().padStart(3)}`);
  }
  lines.push('');
  lines.push(`Total: keep ${plan.keep.length}, cancel ${plan.cancel.length}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run');
  if (!apply && !dryRun) {
    console.error('Usage: dedupe-pending-articles [--dry-run | --apply] [--scope=active|pending]');
    process.exit(2);
  }
  const scope = parseScope(args);

  const plan = await dedupeActive({ apply, scope });

  console.log(summarise(plan, scope));
  if (plan.cancel.length > 0) {
    console.log('\nSample cancellations (first 30):');
    for (const c of plan.cancel.slice(0, 30)) {
      console.log(`  [${c.category}/${c.status}] "${c.keyword}" → kept "${c.keptKeyword}" (${c.reason})`);
    }
    if (plan.cancel.length > 30) console.log(`  ... and ${plan.cancel.length - 30} more`);
  }
  if (apply) {
    console.log('\nApplied. Cancelled rows now have status=cancelled.');
  } else {
    console.log('\n(dry-run — no changes written. Re-run with --apply to commit.)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(async () => { await closeDb(); process.exit(0); })
    .catch(async (err) => { console.error(err); await closeDb(); process.exit(1); });
}

// Backward-compat alias: older tests / docs reference dedupePending.
export const dedupePending = (opts: { apply: boolean }) => dedupeActive({ apply, scope: 'pending' });
