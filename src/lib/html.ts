// src/lib/html.ts
import sanitizeHtml from 'sanitize-html';

const DIV_CLASSES = [
  'faq-section',
  'faq-item',
  'faq-question',
  'faq-answer',
  'xg-cta',
  'inline-image-placeholder',
  'stat-row',
  'stat-block',
  'stat-value',
  'stat-label',
  'callout',
  'tip',
  'warning',
  'callout-body',
  'callout-title',
  'callout-text',
  'highlight-box',
  'highlight-title',
  'highlight-text',
];
const FIGURE_CLASSES = ['article-image'];
const TABLE_CLASSES = ['comparison-table'];
const TD_CLASSES = ['td-green', 'td-red'];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    // h1 is intentionally excluded — the page frame renders the article title as <h1>,
    // body content starts at h2. h1 is listed in `nonTextTags` below so both the
    // tag and its text content are discarded (not left as loose text).
    allowedTags: [
      'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a',
      'div', 'figure', 'figcaption', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    // Preserves sanitize-html defaults (style/script/textarea/option) plus h1.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'h1'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      div: ['class', 'data-query', 'data-caption'],
      figure: ['class'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      table: ['class'],
      td: ['class'],
    },
    allowedClasses: {
      div: DIV_CLASSES,
      figure: FIGURE_CLASSES,
      table: TABLE_CLASSES,
      td: TD_CLASSES,
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

// FAQ items are persisted as structured data via extractFaqSchema and rendered
// by the frontend's <BlogFaqList>. Leaving the markup in the body would render
// the questions twice. Strip the entire faq-section container by counting div
// nesting forward from the opening tag — naive close-tag matching trips on the
// nested faq-item / faq-question / faq-answer divs.
export function stripFaqSection(html: string): string {
  const startRe = /<div\s+class="faq-section"\s*>/i;
  const startMatch = startRe.exec(html);
  if (!startMatch) return html;
  const start = startMatch.index;

  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) {
      const end = m.index + m[0].length;
      const before = html.slice(0, start).replace(/\s+$/, '');
      const after = html.slice(end).replace(/^\s+/, '');
      return after ? before + '\n\n' + after : before;
    }
  }
  return html.slice(0, start).replace(/\s+$/, '');
}

export type InlineImagePlaceholder = {
  fullMatch: string;
  query: string;
  caption: string;
};

const PLACEHOLDER_RE = /<div\s+class="inline-image-placeholder"\s+data-query="([^"]*)"\s+data-caption="([^"]*)"\s*><\/div>/g;

// sanitize-html escapes attribute values, so data-caption="P&L" comes back
// out as data-caption="P&amp;L". Without decoding, escText() in the inline
// image renderer would re-encode it as P&amp;amp;L and the figcaption
// would render the literal text "P&amp;L". Decode the limited set of
// entities sanitize-html emits in attribute context. &amp; is decoded last
// so sequences like &amp;lt; round-trip to the literal &lt;.
function decodeAttrEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function findInlineImagePlaceholders(html: string): InlineImagePlaceholder[] {
  const results: InlineImagePlaceholder[] = [];
  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    results.push({
      fullMatch: match[0],
      query: decodeAttrEntities(match[1]),
      caption: decodeAttrEntities(match[2]),
    });
  }
  return results;
}

export function replacePlaceholder(html: string, placeholder: InlineImagePlaceholder, replacement: string): string {
  return html.replace(placeholder.fullMatch, replacement);
}
