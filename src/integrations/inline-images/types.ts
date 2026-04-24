// src/integrations/inline-images/types.ts
//
// Shared shape for an inline-image candidate returned by Google Custom Search
// or Wikimedia Commons. This is the pre-download shape — URL points to the
// remote source, not yet saved locally.

export type InlineImageSource = {
  url: string;
  sourceName: string;   // e.g. "Wikimedia Commons", or the displayLink from Google
  sourceUrl: string;    // the page the image came from (for attribution link)
  altText: string;
  width: number;
  height: number;
  license: string;      // e.g. "Creative Commons", "CC BY-SA 4.0"
  attribution: string | null; // artist / photographer name if available
  requiresAttribution: boolean;
};
