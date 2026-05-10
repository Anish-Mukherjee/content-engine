# Exchange press-kit assets

This directory holds **hand-curated, brand-licensed images** for each exchange
the pipeline writes about. The `local-press-kit` integration
(`src/integrations/local-press-kit/`) reads from
`storage/exchange-assets/<slug>/` and serves matching images as the priority
inline-image source for the `exchanges` category.

## Why this exists

Stock-photo APIs (Pexels, Pixabay, Unsplash, Freepik, Wikimedia) do not have
legitimate screenshots of proprietary exchange interfaces. The only legal
source for "Bybit perpetual contract trading interface"-type imagery is each
exchange's own published press kit / brand assets — i.e. material the
exchange has explicitly authorized for editorial use.

Without these assets, the pipeline falls back to generic trading stock photos
for exchange-review articles, which look generic and hurt content quality.

## Layout

```
storage/exchange-assets/
├── README.md                   ← this file
├── bybit/
│   ├── README.md
│   ├── trading-interface.jpg   ← drop your assets here
│   ├── perpetual-screen.png
│   └── ...
├── binance/
│   └── ...
└── ...
```

Slug must match the directory name AND an entry in `EXCHANGE_SLUGS` in
`src/integrations/local-press-kit/index.ts`. Adding a new exchange? Update
both.

## How to source assets (manual workflow)

1. Visit the exchange's brand assets / press kit / media kit page. Most
   exchanges publish one — search "<exchange name> press kit" or check
   the footer of their site (often under "Newsroom", "About", or "Press").
2. Read the brand-asset terms. Most exchange press kits permit editorial
   use without prior sign-off; a few require attribution. Note any
   restrictions in this directory's per-exchange README.
3. Download the assets you want to use (logos, platform screenshots, marketing
   imagery). Prefer **horizontal/landscape** crops at **>= 1200×675** so the
   pipeline's 800×450 cover-crop has headroom.
4. Drop them in `storage/exchange-assets/<slug>/` with descriptive filenames.
5. Restart pm2 if running in prod (`pm2 restart content-pipeline`) so the
   process picks up the new directory contents on its next inline-image
   lookup. (No restart needed for new files added to existing dirs — the
   source re-reads on every call.)

## Supported file types

`.jpg`, `.jpeg`, `.png`, `.webp` — anything sharp can decode.

## Git policy

The image binaries are gitignored (see `.gitignore`). Only `README.md` files
are tracked. This keeps the repo lean and lets each environment curate its
own asset set if it ever needs to diverge.

## Selection logic

`detectExchangeSlug(query)` in `src/integrations/local-press-kit/index.ts`
matches case-insensitively against `EXCHANGE_SLUGS` with word-boundary checks.
Common multi-word names (`Gate.io`, `Crypto.com`) are normalized via
`QUERY_ALIASES`.

If the inline-image query string mentions a slug AND that slug's directory
contains usable images, those candidates are returned first. Otherwise the
pipeline falls through to Wikimedia → Unsplash → Pexels → Pixabay → Freepik
(per `CATEGORY_INLINE_SOURCES.exchanges` in `src/config/categories.ts`).
