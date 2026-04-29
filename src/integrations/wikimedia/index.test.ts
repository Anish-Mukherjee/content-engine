// src/integrations/wikimedia/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchImages } from './client';
import { findInlineImage } from './index';

vi.mock('./client');

describe('wikimedia integration', () => {
  beforeEach(() => {
    vi.mocked(searchImages).mockReset();
  });

  it('returns null when no pages', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([]);
    const result = await findInlineImage('anything');
    expect(result).toBeNull();
  });

  it('returns null when pages have no valid dimensions', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      { title: 'a', imageinfo: [{ url: 'x.jpg', width: 100, height: 100, descriptionurl: 'y', extmetadata: {} }] },
    ]);
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('filters out PDFs and other non-raster files even when dimensions are valid', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        title: 'a', index: 1,
        imageinfo: [{
          url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Paper.pdf',
          width: 1275, height: 1650,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Paper.pdf',
        }],
      },
      {
        title: 'b', index: 2,
        imageinfo: [{
          url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Photo.jpg',
          width: 1275, height: 1650,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Photo.jpg',
          extmetadata: { LicenseShortName: { value: 'CC BY 2.0' } },
        }],
      },
    ]);
    const result = await findInlineImage('q');
    expect(result?.url).toContain('.jpg');
    expect(result?.url).not.toContain('.pdf');
  });

  it('maps the first valid page to an InlineImageSource, stripping HTML from extmetadata', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        title: 'File:Chart.jpg',
        imageinfo: [{
          url: 'https://upload.wikimedia.org/chart.jpg',
          width: 1000,
          height: 800,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Chart.jpg',
          extmetadata: {
            ImageDescription: { value: '<p>A trading <b>chart</b></p>' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
            Artist: { value: '<a href="https://x">Jane Doe</a>' },
          },
        }],
      },
    ]);
    const result = await findInlineImage('trading chart');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://upload.wikimedia.org/chart.jpg');
    expect(result?.sourceName).toBe('Wikimedia Commons');
    expect(result?.sourceUrl).toBe('https://commons.wikimedia.org/wiki/File:Chart.jpg');
    expect(result?.license).toBe('CC BY-SA 4.0');
    expect(result?.attribution).toBe('Jane Doe');
    expect(result?.altText).toBe('A trading chart');
  });

  it('uses the query string as altText when ImageDescription is missing', async () => {
    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        title: 'File:X.jpg',
        imageinfo: [{
          url: 'https://u/x.jpg', width: 1000, height: 800,
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
          extmetadata: {},
        }],
      },
    ]);
    const result = await findInlineImage('my query');
    expect(result?.altText).toBe('my query');
    expect(result?.license).toBe('Creative Commons');
  });
});

import { findInlineCandidates } from './index';

describe('wikimedia findInlineCandidates', () => {
  it('returns all valid pages with sourceId = descriptionurl', async () => {
    (searchImages as unknown as vi.Mock).mockResolvedValueOnce([
      {
        title: 'File:A.jpg', index: 1,
        imageinfo: [{ url: 'https://up/A.jpg', width: 1200, height: 800,
          descriptionurl: 'https://commons/A', extmetadata: {} }],
      },
      {
        title: 'File:B.jpg', index: 2,
        imageinfo: [{ url: 'https://up/B.jpg', width: 1200, height: 800,
          descriptionurl: 'https://commons/B', extmetadata: {} }],
      },
    ]);
    const out = await findInlineCandidates('q');
    expect(out).toHaveLength(2);
    expect(out[0].sourceId).toBe('https://commons/A');
    expect(out[0].inlineSource.url).toBe('https://up/A.jpg');
    expect(out[1].sourceId).toBe('https://commons/B');
  });
});
