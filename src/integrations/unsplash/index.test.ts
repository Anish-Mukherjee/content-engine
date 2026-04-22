// src/integrations/unsplash/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { searchHeroImage, downloadAndCrop, getFallbackImage } from './index';

describe('unsplash integration', () => {
  const fetchMock = vi.fn();
  let tmpStorageDir: string;

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.UNSPLASH_ACCESS_KEY = 'test';
    tmpStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-test-'));
    process.env.STORAGE_DIR = tmpStorageDir;
    fetchMock.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(tmpStorageDir, { recursive: true, force: true });
  });

  it('searchHeroImage returns null when no results', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const photo = await searchHeroImage('exchanges');
    expect(photo).toBeNull();
  });

  it('searchHeroImage returns the top result mapped to UnsplashPhoto', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'abc',
          alt_description: 'trading desk',
          urls: { raw: 'https://images.unsplash.com/raw.jpg' },
          user: { name: 'John Smith', links: { html: 'https://unsplash.com/@john' } },
          width: 4000, height: 3000,
        }],
      }), { status: 200 }),
    );
    const photo = await searchHeroImage('exchanges');
    expect(photo?.id).toBe('abc');
    expect(photo?.photographerName).toBe('John Smith');
    expect(photo?.urlRaw).toBe('https://images.unsplash.com/raw.jpg');
  });

  it('getFallbackImage returns a category fallback', () => {
    const img = getFallbackImage('exchanges');
    expect(img.isFallback).toBe(true);
    expect(img.url).toContain('exchanges');
  });
});
