// src/integrations/unsplash/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { searchHeroImage, downloadAndCrop, getFallbackImage, searchHeroCandidates } from './index';
import { search } from './client';

vi.mock('./client', () => ({ search: vi.fn() }));

describe('unsplash integration', () => {
  let tmpStorageDir: string;

  beforeEach(async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockReset();
    process.env.UNSPLASH_ACCESS_KEY = 'test';
    tmpStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-test-'));
    process.env.STORAGE_DIR = tmpStorageDir;
  });

  afterEach(async () => {
    await fs.rm(tmpStorageDir, { recursive: true, force: true });
  });

  it('searchHeroImage returns null when no results', async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ results: [] });
    const photo = await searchHeroImage('exchanges');
    expect(photo).toBeNull();
  });

  it('searchHeroImage returns the top result mapped to UnsplashPhoto', async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      results: [{
        id: 'abc',
        alt_description: 'trading desk',
        urls: { raw: 'https://images.unsplash.com/raw.jpg' },
        user: { name: 'John Smith', links: { html: 'https://unsplash.com/@john' } },
        width: 4000, height: 3000,
      }],
    });
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

describe('searchHeroCandidates', () => {
  beforeEach(() => (search as unknown as ReturnType<typeof vi.fn>).mockReset());

  it('returns all results mapped to UnsplashPhoto', async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      results: [
        { id: 'a', urls: { raw: 'https://u/a' }, alt_description: 'a alt',
          user: { name: 'A', links: { html: 'https://u/A' } }, width: 1000, height: 600 },
        { id: 'b', urls: { raw: 'https://u/b' }, alt_description: null,
          user: { name: 'B', links: { html: 'https://u/B' } }, width: 1000, height: 600 },
      ],
    });
    const out = await searchHeroCandidates('indicators');
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('a');
    expect(out[1].id).toBe('b');
  });

  it('returns empty list when results missing', async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const out = await searchHeroCandidates('indicators');
    expect(out).toEqual([]);
  });

  it('uses widened query when wide=true', async () => {
    (search as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ results: [] });
    await searchHeroCandidates('indicators', { wide: true });
    const calledQuery = (search as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledQuery).not.toBe('financial chart technical indicators'); // i.e. NOT the primary
  });
});
