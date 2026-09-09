// src/config/brand.ts
export type BrandConfig = {
  name: string;
  domain: string;
  description: string;
  ctaHtml: string;
  signupUrl: string;
  audience: string;
};

export const BRAND: BrandConfig = {
  name: 'XeroGravity',
  domain: 'xerogravity.com',
  description:
    'a meme coin trading terminal that tracks KOL calls and smart-money wallets on Solana ' +
    'and Robinhood chain in real time, with copy trading and autopilot execution',
  signupUrl: 'https://xerogravity.com/',
  audience: 'active meme coin traders',
  ctaHtml:
    '<div class="xg-cta"><p>Watching every KOL channel and smart-money wallet by hand is a full-time job. ' +
    'XeroGravity does it for you — live KOL and wallet signals with win rates, one-click buys, ' +
    'and autopilot with take profit and stop loss on Solana and Robinhood chain. ' +
    '<a href="https://xerogravity.com/">Start free.</a></p></div>',
};
