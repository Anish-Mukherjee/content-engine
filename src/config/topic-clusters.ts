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
