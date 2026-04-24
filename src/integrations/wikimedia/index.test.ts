// src/integrations/wikimedia/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findInlineImage } from './index';

describe('wikimedia integration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no pages', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 }),
    );
    const result = await findInlineImage('anything');
    expect(result).toBeNull();
  });

  it('returns null when pages have no valid dimensions', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        query: { pages: {
          '1': { title: 'a', imageinfo: [{ url: 'x.jpg', width: 100, height: 100, descriptionurl: 'y' }] },
        } },
      }), { status: 200 }),
    );
    const result = await findInlineImage('q');
    expect(result).toBeNull();
  });

  it('filters out PDFs and other non-raster files even when dimensions are valid', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        query: { pages: {
          '1': { title: 'a', imageinfo: [{
            url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Paper.pdf',
            width: 1275, height: 1650,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Paper.pdf',
          }] },
          '2': { title: 'b', imageinfo: [{
            url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Photo.jpg',
            width: 1275, height: 1650,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Photo.jpg',
            extmetadata: { LicenseShortName: { value: 'CC BY 2.0' } },
          }] },
        } },
      }), { status: 200 }),
    );
    const result = await findInlineImage('q');
    expect(result?.url).toContain('.jpg');
    expect(result?.url).not.toContain('.pdf');
  });

  it('maps the first valid page to an InlineImageSource, stripping HTML from extmetadata', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        query: { pages: {
          '1': {
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
        } },
      }), { status: 200 }),
    );
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
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        query: { pages: {
          '1': {
            title: 'File:X.jpg',
            imageinfo: [{
              url: 'https://u/x.jpg', width: 1000, height: 800,
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
              extmetadata: {},
            }],
          },
        } },
      }), { status: 200 }),
    );
    const result = await findInlineImage('my query');
    expect(result?.altText).toBe('my query');
    expect(result?.license).toBe('Creative Commons');
  });
});
