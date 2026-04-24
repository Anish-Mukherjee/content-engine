// src/lib/html.test.ts
import { describe, it, expect } from 'vitest';
import {
  sanitizeArticleHtml, countWords, extractFaqSchema,
  findInlineImagePlaceholders, replacePlaceholder,
} from './html';

describe('html helpers', () => {
  it('sanitizeArticleHtml strips script tags', () => {
    const dirty = '<h2>Hi</h2><script>alert(1)</script><p>Body</p>';
    const out = sanitizeArticleHtml(dirty);
    expect(out).not.toContain('<script');
    expect(out).toContain('<h2>Hi</h2>');
    expect(out).toContain('<p>Body</p>');
  });

  it('sanitizeArticleHtml drops h1 tag AND its text (frame renders article title as H1)', () => {
    const dirty = '<h1>Duplicate title</h1><h2>Real heading</h2><p>Body</p>';
    const out = sanitizeArticleHtml(dirty);
    expect(out).not.toContain('<h1');
    expect(out).not.toContain('Duplicate title');
    expect(out).toContain('<h2>Real heading</h2>');
    expect(out).toContain('<p>Body</p>');
  });

  it('sanitizeArticleHtml strips inline event handlers', () => {
    const dirty = '<p onclick="evil()">x</p>';
    const out = sanitizeArticleHtml(dirty);
    expect(out).not.toContain('onclick');
  });

  it('sanitizeArticleHtml allows xg-cta and faq-* classes', () => {
    const clean = '<div class="faq-section"><div class="faq-item"><div class="faq-question">Q?</div><div class="faq-answer"><p>A.</p></div></div></div>';
    const out = sanitizeArticleHtml(clean);
    expect(out).toContain('class="faq-section"');
    expect(out).toContain('class="faq-item"');
  });

  it('sanitizeArticleHtml rejects a non-allowlist class', () => {
    const dirty = '<div class="evil-class">x</div>';
    const out = sanitizeArticleHtml(dirty);
    expect(out).not.toContain('evil-class');
  });

  it('sanitizeArticleHtml preserves inline image placeholder with data-query and data-caption', () => {
    const html = '<p>Intro.</p><div class="inline-image-placeholder" data-query="Bybit perpetual interface" data-caption="Bybit interface"></div><p>More.</p>';
    const out = sanitizeArticleHtml(html);
    expect(out).toContain('class="inline-image-placeholder"');
    expect(out).toContain('data-query="Bybit perpetual interface"');
    expect(out).toContain('data-caption="Bybit interface"');
  });

  it('sanitizeArticleHtml allows figure.article-image with img and figcaption', () => {
    const html = '<figure class="article-image"><img src="https://cdn.example/p.jpg" alt="alt" width="800" height="450" loading="lazy" /><figcaption>caption — <a href="https://commons.wikimedia.org">Wikimedia</a> (CC)</figcaption></figure>';
    const out = sanitizeArticleHtml(html);
    expect(out).toContain('<figure class="article-image">');
    expect(out).toContain('<img');
    expect(out).toContain('src="https://cdn.example/p.jpg"');
    expect(out).toContain('<figcaption>');
  });

  it('sanitizeArticleHtml rejects non-https image src', () => {
    const html = '<figure class="article-image"><img src="javascript:alert(1)" alt="x" /></figure>';
    const out = sanitizeArticleHtml(html);
    expect(out).not.toContain('javascript:');
  });

  it('countWords ignores HTML tags', () => {
    expect(countWords('<h1>One two three</h1><p>four five</p>')).toBe(5);
  });

  it('extractFaqSchema builds FAQPage schema from faq-item divs', () => {
    const html = `
      <div class="faq-section">
        <div class="faq-item">
          <div class="faq-question">Is it safe?</div>
          <div class="faq-answer"><p>Yes, with small leverage.</p></div>
        </div>
        <div class="faq-item">
          <div class="faq-question">What leverage?</div>
          <div class="faq-answer"><p>Start at 2x-5x.</p></div>
        </div>
      </div>
    `;
    const schema = extractFaqSchema(html);
    expect(schema).not.toBeNull();
    expect(schema!['@type']).toBe('FAQPage');
    const entities = schema!.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe('Is it safe?');
    expect(entities[0].acceptedAnswer.text).toContain('small leverage');
  });

  it('extractFaqSchema returns null when no FAQ items', () => {
    expect(extractFaqSchema('<p>no faq</p>')).toBeNull();
  });

  it('findInlineImagePlaceholders returns query+caption for every placeholder', () => {
    const html = [
      '<p>intro</p>',
      '<div class="inline-image-placeholder" data-query="first query" data-caption="first caption"></div>',
      '<p>mid</p>',
      '<div class="inline-image-placeholder" data-query="second q" data-caption="second c"></div>',
    ].join('');
    const placeholders = findInlineImagePlaceholders(html);
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0].query).toBe('first query');
    expect(placeholders[0].caption).toBe('first caption');
    expect(placeholders[1].query).toBe('second q');
  });

  it('replacePlaceholder substitutes the full match with the given HTML', () => {
    const html = '<p>a</p><div class="inline-image-placeholder" data-query="q" data-caption="c"></div><p>b</p>';
    const placeholders = findInlineImagePlaceholders(html);
    const out = replacePlaceholder(html, placeholders[0], '<figure class="article-image"><img src="https://x/y.jpg" alt="c" /></figure>');
    expect(out).toContain('<figure class="article-image">');
    expect(out).not.toContain('inline-image-placeholder');
    expect(out).toContain('<p>a</p>');
    expect(out).toContain('<p>b</p>');
  });
});
