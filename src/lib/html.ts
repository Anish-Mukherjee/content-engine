// src/lib/html.ts
import sanitizeHtml from 'sanitize-html';

const DIV_CLASSES = [
  'faq-section',
  'faq-item',
  'faq-question',
  'faq-answer',
  'xg-cta',
  'inline-image-placeholder',
];
const FIGURE_CLASSES = ['article-image'];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    // h1 is intentionally excluded — the page frame renders the article title as <h1>,
    // body content starts at h2. h1 is listed in `nonTextTags` below so both the
    // tag and its text content are discarded (not left as loose text).
    allowedTags: [
      'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a',
      'div', 'figure', 'figcaption', 'img',
    ],
    // Preserves sanitize-html defaults (style/script/textarea/option) plus h1.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'h1'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      div: ['class', 'data-query', 'data-caption'],
      figure: ['class'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
    },
    allowedClasses: {
      div: DIV_CLASSES,
      figure: FIGURE_CLASSES,
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesByTag: {
      img: ['https'],
      a: ['https', 'mailto'],
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, rel: 'nofollow noopener', target: '_blank' },
      }),
    },
  });
}

export function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

type FaqSchema = {
  '@context': string;
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }>;
};

const FAQ_ITEM_RE = /<div class="faq-item">[\s\S]*?<div class="faq-question">([\s\S]*?)<\/div>[\s\S]*?<div class="faq-answer">([\s\S]*?)<\/div>[\s\S]*?<\/div>/g;

export function extractFaqSchema(html: string): FaqSchema | null {
  const faqs: Array<{ question: string; answer: string }> = [];
  for (const match of html.matchAll(FAQ_ITEM_RE)) {
    const question = match[1].replace(/<[^>]*>/g, '').trim();
    const answer = match[2].replace(/<[^>]*>/g, '').trim();
    if (question && answer) faqs.push({ question, answer });
  }
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export type InlineImagePlaceholder = {
  fullMatch: string;
  query: string;
  caption: string;
};

const PLACEHOLDER_RE = /<div\s+class="inline-image-placeholder"\s+data-query="([^"]*)"\s+data-caption="([^"]*)"\s*><\/div>/g;

export function findInlineImagePlaceholders(html: string): InlineImagePlaceholder[] {
  const results: InlineImagePlaceholder[] = [];
  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    results.push({ fullMatch: match[0], query: match[1], caption: match[2] });
  }
  return results;
}

export function replacePlaceholder(html: string, placeholder: InlineImagePlaceholder, replacement: string): string {
  return html.replace(placeholder.fullMatch, replacement);
}
