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
    '<div class="xg-cta"><p>Getting these signals manually takes hours. ' +
    'XeroGravity scans the market 24/7 and delivers AI-powered crypto futures signals ' +
    'automatically. <a href="https://xerogravity.com/signup">Start free today.</a></p></div>',
};
