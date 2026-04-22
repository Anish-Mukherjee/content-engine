// scripts/gen-fallbacks.mjs
// One-shot utility to emit 10 placeholder 1200x630 grey JPEGs for each category.
// These are PLACEHOLDERS — replace with branded art before production.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'storage', 'images', 'fallbacks');

const CATEGORIES = [
  'exchanges', 'patterns', 'indicators', 'concepts', 'strategies',
  'automation', 'risk', 'coins', 'education', 'analysis',
];

for (const cat of CATEGORIES) {
  const outPath = path.join(OUT_DIR, `${cat}.jpg`);
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .jpeg({ quality: 85 })
    .toFile(outPath);
  console.log('wrote', outPath);
}
