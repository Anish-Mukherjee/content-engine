// scripts/dedupe-pending-articles.ts
//
// Apply token-set signature dedup to pending articles. Groups all 'pending'
// rows by signature; keeps the highest-search-volume row per signature; marks
// the rest as 'cancelled'. Also cancels any pending row whose signature
// already matches a published article.
//
// Run with --dry-run to preview the plan without writing.
//
//   npm run dedupe:pending -- --dry-run
//   npm run dedupe:pending -- --apply
//
import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import { db, closeDb } from '../src/db/client';
import { articles } from '../src/db/schema';
import { signature } from '../src/lib/keyword-signature';

type Article = typeof articles.$inferSelect;

export type DedupePlan = {
  keep: Array<{ id: string; keyword: string; category: string; signature: string; searchVolume: number | null }>;
  cancel: Array<{
    id: string;
    keyword: string;
    category: string;
    signature: string;
    searchVolume: number | null;
    reason: string;
    keptKeyword: string;
  }>;
};

function pickRepresentative(rows: Article[]): Article {
  // Highest search_volume wins; tiebreak by oldest createdAt (earliest discovered).
  return [...rows].sort((a, b) => {
    const sv = (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    if (sv !== 0) return sv;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

export function buildDedupePlan(pending: Article[], occupied: Article[]): DedupePlan {
  // Map signatures held by published / in-flight (occupied) rows → representative keyword.
  const occupiedSig = new Map<string, string>();
  for (const a of occupied) {
    const sig = signature(a.keyword);
    if (!sig) continue;
    if (!occupiedSig.has(sig)) occupiedSig.set(sig, a.keyword);
  }

  // Group pending by signature.
  const groups = new Map<string, Article[]>();
  const sigless: Article[] = [];
  for (const a of pending) {
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
      // Whole group collides with an existing published / in-flight article.
      for (const r of rows) {
        plan.cancel.push({
          id: r.id, keyword: r.keyword, category: r.category, signature: sig,
          searchVolume: r.searchVolume,
          reason: 'duplicate_signature: existing_article',
          keptKeyword: occupiedKw,
        });
      }
      continue;
    }
    const keeper = pickRepresentative(rows);
    plan.keep.push({
      id: keeper.id, keyword: keeper.keyword, category: keeper.category,
      signature: sig, searchVolume: keeper.searchVolume,
    });
    for (const r of rows) {
      if (r.id === keeper.id) continue;
      plan.cancel.push({
        id: r.id, keyword: r.keyword, category: r.category, signature: sig,
        searchVolume: r.searchVolume,
        reason: 'duplicate_signature: pending_cluster',
        keptKeyword: keeper.keyword,
      });
    }
  }

  // Sigless rows (e.g. all stop-words) — keep them; nothing to cluster on.
  for (const r of sigless) {
    plan.keep.push({
      id: r.id, keyword: r.keyword, category: r.category, signature: '',
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

export async function dedupePending(opts: { apply: boolean }): Promise<DedupePlan> {
  const pending = await db().select().from(articles).where(eq(articles.status, 'pending'));
  // Occupied = published OR any in-flight status that isn't 'pending' itself
  // (so a 'scheduled' article in the same cluster still wins over a 'pending' dupe).
  const occupied = await db().select().from(articles).where(
    inArray(articles.status, ['published', ...ACTIVE_STATUSES.filter((s) => s !== 'pending')]),
  );

  const plan = buildDedupePlan(pending, occupied);
  if (!opts.apply) return plan;

  for (const c of plan.cancel) {
    await db().update(articles).set({
      status: 'cancelled',
      lastError: `${c.reason} (kept "${c.keptKeyword}")`,
    }).where(eq(articles.id, c.id));
  }
  return plan;
}

function summarise(plan: DedupePlan): string {
  const byCategory = new Map<string, { keep: number; cancel: number }>();
  for (const k of plan.keep) {
    const e = byCategory.get(k.category) ?? { keep: 0, cancel: 0 };
    e.keep++;
    byCategory.set(k.category, e);
  }
  for (const c of plan.cancel) {
    const e = byCategory.get(c.category) ?? { keep: 0, cancel: 0 };
    e.cancel++;
    byCategory.set(c.category, e);
  }
  const lines: string[] = [];
  lines.push('Dedup plan by category (pending → keep / cancel):');
  for (const [cat, e] of [...byCategory.entries()].sort()) {
    lines.push(`  ${cat.padEnd(12)} ${(e.keep + e.cancel).toString().padStart(4)} → keep ${e.keep.toString().padStart(3)}, cancel ${e.cancel.toString().padStart(3)}`);
  }
  lines.push(`Total: keep ${plan.keep.length}, cancel ${plan.cancel.length}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run');
  if (!apply && !dryRun) {
    console.error('Usage: dedupe-pending-articles [--dry-run | --apply]');
    process.exit(2);
  }

  const plan = await dedupePending({ apply });

  console.log(summarise(plan));
  if (plan.cancel.length > 0) {
    console.log('\nSample cancellations (first 30):');
    for (const c of plan.cancel.slice(0, 30)) {
      console.log(`  [${c.category}] "${c.keyword}" → kept "${c.keptKeyword}" (${c.reason})`);
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
