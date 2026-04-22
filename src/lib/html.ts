// src/lib/html.ts
import sanitizeHtml from 'sanitize-html';

const ALLOWED_CLASSES = ['faq-section', 'faq-item', 'faq-question', 'faq-answer', 'xg-cta'];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'div'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      div: ['class'],
    },
    allowedClasses: { div: ALLOWED_CLASSES },
    allowedSchemes: ['https', 'mailto'],
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
