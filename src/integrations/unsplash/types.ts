// src/integrations/unsplash/types.ts
export type UnsplashPhoto = {
  id: string;
  urlRaw: string;
  altText: string;
  photographerName: string;
  photographerUrl: string;
  width: number;
  height: number;
};

export type LocalImage = {
  url: string;         // path served by our own HTTP, e.g. /images/foo-hero.jpg
  altText: string;
  width: number;
  height: number;
  photographerName: string | null;
  photographerUrl: string | null;
  unsplashId: string | null;
  isFallback: boolean;
};
