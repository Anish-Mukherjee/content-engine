// src/config/topic-clusters.ts
//
// Topic clusters for content-saturation checks. Token-set signatures distinguish
// "crypto trading bot" from "trading bot crypto" (good — those are duplicates),
// but they also distinguish "ai bot" / "crypto bot" / "automated bot" /
// "beginner bot" as different topics (bad — to a reader those are all the same
// cluster of content). Topic clusters fix the second problem.
//
// A keyword is "in cluster X" if its signature contains any of cluster X's
// anchor tokens. When a cluster has been published within CLUSTER_COOLDOWN_DAYS,
// candidate keywords in that cluster are suppressed by:
//   - pickNextDrivable (skip when picking next article to drive)
//   - harvest Pass 2c (filter at ingestion time)
//   - dedupe:pending cleanup (cancel existing pending/active)
//
// Universal platform tokens (crypto, future, trade) are intentionally NOT
// listed here — they appear in nearly every keyword and applying cooldown to
// them would starve the queue of relevant content. The platform IS crypto
// futures trading.

import { signature } from '../lib/keyword-signature';

export const CLUSTER_COOLDOWN_DAYS = 14;

// Anchor tokens are post-signature forms (after alias + lemma + stop-word
// filtering). E.g. "trading"→"trade", "bots"→"bot", "automation"→"automated",
// "algo"→"algorithm" before this map is consulted.
export const TOPIC_CLUSTERS: Record<string, string[]> = {
  // Trading-bot / automation cluster — covers bot/robot/algo/automated/AI
  // products, all of which read as the same "automation tool" topic.
  bot: ['bot', 'algorithm', 'automated', 'ai'],

  // Strategy types
  scalping: ['scalp'],
  swing: ['swing'],
  meanreversion: ['reversion'],

  // Indicators
  rsi: ['rsi'],
  macd: ['macd'],
  ema: ['ema'],
  sma: ['sma'],
  bollinger: ['bollinger'],
  vwap: ['vwap'],
  ichimoku: ['ichimoku'],

  // Chart patterns
  candlestick: ['candlestick', 'candle', 'doji', 'hammer', 'engulfing'],
  doublepattern: ['doublebottom', 'doubletop'],
  headshoulders: ['headshoulder'],
  trianglepattern: ['triangle', 'pennant', 'wedge', 'flag'],
  cuphandle: ['cup'],

  // Concepts
  leverage: ['leverage', 'margin'],
  funding: ['funding'],
  liquidation: ['liquidation'],

  // Exchanges (each its own cluster)
  bybit: ['bybit'],
  binance: ['binance'],
  okx: ['okx'],
  blofin: ['blofin'],
  bitget: ['bitget'],
  kucoin: ['kucoin'],
  mexc: ['mexc'],
  bitmex: ['bitmex'],
  kraken: ['kraken'],
  coinbase: ['coinbase'],

  // Major coins (each its own cluster — keeps "BTC futures" + "ETH futures"
  // from publishing back to back)
  bitcoin: ['bitcoin'],
  ethereum: ['ethereum'],
  solana: ['solana'],
  binancecoin: ['binancecoin'],
  ripple: ['ripple'],
  dogecoin: ['dogecoin'],
  avalanche: ['avalanche'],
  chainlink: ['chainlink'],
  cardano: ['cardano'],
  polkadot: ['polkadot'],
  polygon: ['polygon'],
  litecoin: ['litecoin'],
};

// Reverse index: anchor-token → cluster-name. Built once at module load.
const TOKEN_TO_CLUSTER: Record<string, string> = {};
for (const [cluster, tokens] of Object.entries(TOPIC_CLUSTERS)) {
  for (const t of tokens) TOKEN_TO_CLUSTER[t] = cluster;
}

export function clusterTagsFromSignature(sig: string): Set<string> {
  const result = new Set<string>();
  if (!sig) return result;
  for (const t of sig.split(' ')) {
    const c = TOKEN_TO_CLUSTER[t];
    if (c) result.add(c);
  }
  return result;
}

export function clusterTags(keyword: string): Set<string> {
  return clusterTagsFromSignature(signature(keyword));
}

export function intersects(tags: Set<string>, cooldown: ReadonlySet<string>): boolean {
  for (const t of tags) if (cooldown.has(t)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────
// saturationTags — the cooldown key used by EVERY saturation guard.
//
// clusterTags is an ALLOWLIST: it only tags keywords whose signature contains
// a hand-listed anchor. Any topic nobody thought to add (fear & greed,
// sentiment, ETF, halving, …) gets an EMPTY set → it becomes invisible to the
// cooldown system and can publish back-to-back forever. That allowlist gap is
// exactly what let "fear and greed index" dominate the feed (June 2026
// incident) — and why the same class of bug recurred after the May 2026 fix,
// which had hard-listed only the topics saturating then (trading bots).
//
// saturationTags closes the gap by DERIVING a key from the keyword itself when
// no curated cluster matches: it falls back to the signature's salient
// (non-universal) tokens. So publishing "fear and greed index" now contributes
// {kw:fear, kw:greed, kw:index}; the next "crypto fear and greed" shares
// {kw:fear, kw:greed} and is correctly suppressed. No topic can ever be
// cooldown-invisible again.
//
// INVARIANT: saturationTags(kw) is NEVER empty for any keyword. Curated
// clusters still win where they exist (so "BTC futures" and "bitcoin futures"
// still collapse via the bitcoin cluster). Every cooldown callsite
// (getCooldownClusters, pickNextDrivable, harvest Pass 2c, dedupe-pending)
// MUST use this function, not clusterTags — a split would let a row survive one
// filter while being skipped by another and loop in the queue forever.
//
// UNIVERSAL_TOKENS are platform words that appear in nearly every keyword and
// carry no topical meaning. They are excluded from the fallback so we don't put
// the entire queue on cooldown. This list is the one residual allowlist; keep
// it SMALL and review it against production keyword frequency periodically.
export const UNIVERSAL_TOKENS = new Set<string>([
  'crypto', 'future', 'trade', 'market', 'price',
  'platform', 'exchange', 'contract', 'coin', 'fee',
]);

export function saturationTags(keyword: string): Set<string> {
  // 1) Curated clusters win — they encode real synonym knowledge (btc↔bitcoin,
  //    margin↔leverage) that token-level fallback can't.
  const curated = clusterTags(keyword);
  if (curated.size > 0) return curated;

  // 2) Fallback: salient signature tokens. Prefixed with "kw:" so the ad-hoc
  //    keys never collide with curated cluster names.
  const sig = signature(keyword);
  if (!sig) return new Set(['kw:sigless']); // all-stop-word keyword (degenerate)
  const salient = sig.split(' ').filter((t) => t && !UNIVERSAL_TOKENS.has(t));
  if (salient.length > 0) return new Set(salient.map((t) => `kw:${t}`));

  // 3) Every token was universal (e.g. "crypto futures trade"): key on the
  //    whole signature so identical platform topics still collide, but distinct
  //    ones don't. Never empty.
  return new Set([`kw:${sig.replace(/ /g, '_')}`]);
}
