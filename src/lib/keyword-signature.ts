// src/lib/keyword-signature.ts
//
// Token-set signature for keyword dedup. Two keywords with the same signature
// describe the same article topic in different word orders or synonyms — e.g.
// "crypto trading bot", "best crypto trading bot", "trading bot crypto",
// "cryptocurrency trading bot", "crypto robot trading" all collapse to
// "bot crypto trade". Used by the harvest pipeline (Pass 2) and the
// dedupe:pending cleanup script.

const STOP_WORDS = new Set([
  // Marketing / superlatives — never the topic itself
  'best', 'top', 'good', 'great', 'better', 'cheapest', 'lowest',
  'awesome', 'ultimate', 'complete', 'perfect',
  // Articles
  'the', 'a', 'an',
  // Prepositions / connectors
  'of', 'for', 'in', 'on', 'with', 'to', 'from', 'by', 'at', 'as',
  'and', 'or', 'vs', 'versus',
  // Question words (rarely changes the topic of an SEO blog)
  'how', 'what', 'why', 'when', 'where', 'who', 'which',
  // Auxiliary verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall',
  'has', 'have', 'had',
]);

// Multi-word phrases collapsed to a single canonical token before tokenisation.
const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bartificial\s+intelligence\b/gi, 'ai'],
  [/\bcrypto\s*currency\b/gi, 'crypto'],
  [/\bdouble\s+top\b/gi, 'doubletop'],
  [/\bdouble\s+bottom\b/gi, 'doublebottom'],
  [/\bhead\s+and\s+shoulders\b/gi, 'headshoulders'],
];

// Single-token aliases applied after tokenisation. Maps surface form → canonical.
// Order doesn't matter — each token is rewritten exactly once via lookup.
const ALIASES: Record<string, string> = {
  // Verb / noun forms of "trade"
  trading: 'trade',
  trader: 'trade',
  traders: 'trade',
  trades: 'trade',

  // Plural → singular for high-frequency nouns
  bots: 'bot',
  robot: 'bot',
  robots: 'bot',
  signals: 'signal',
  patterns: 'pattern',
  strategies: 'strategy',
  indicators: 'indicator',
  exchanges: 'exchange',
  platforms: 'platform',
  guides: 'guide',
  tools: 'tool',
  tutorials: 'tutorial',
  reviews: 'review',
  comparisons: 'comparison',
  contracts: 'contract',
  positions: 'position',
  futures: 'future',
  options: 'option',
  coins: 'coin',
  fees: 'fee',
  charts: 'chart',
  candles: 'candle',
  candlesticks: 'candlestick',
  levels: 'level',
  zones: 'zone',
  bands: 'band',
  rules: 'rule',
  beginners: 'beginner',

  // Synonyms
  cryptocurrencies: 'crypto',
  cryptocurrency: 'crypto',
  auto: 'automated',
  automation: 'automated',
  algo: 'algorithm',
  algorithmic: 'algorithm',

  // Tickers → coin names (so e.g. "BTC futures" matches "bitcoin futures")
  btc: 'bitcoin',
  eth: 'ethereum',
  ether: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
  xrp: 'ripple',
  doge: 'dogecoin',
  avax: 'avalanche',
  link: 'chainlink',
  ada: 'cardano',
  dot: 'polkadot',
  matic: 'polygon',
  ltc: 'litecoin',
};

export function signature(keyword: string): string {
  let s = keyword.toLowerCase().trim();
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }

  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);

  const canonical = tokens
    .map((t) => ALIASES[t] ?? t)
    .filter((t) => !STOP_WORDS.has(t));

  return Array.from(new Set(canonical)).sort().join(' ');
}
