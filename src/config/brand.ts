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
  description: 'a crypto futures trading signals platform powered by AI',
  signupUrl: 'https://xerogravity.com/signup',
  audience: 'active crypto futures traders',
  ctaHtml:
    '<div class="xg-cta"><p>Scanning the market for setups like this manually takes hours. ' +
    'XeroGravity does it automatically — AI-powered signals with entry, take profit, and stop ' +
    'loss levels delivered to your dashboard in real time. ' +
    '<a href="https://xerogravity.com/signup">Start free.</a></p></div>',
};
