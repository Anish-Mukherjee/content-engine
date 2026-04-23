// src/config/prompts.ts
import type { BrandConfig } from './brand';

export function perplexityResearchSystem(brand: BrandConfig): string {
  return `You are a content research assistant for ${brand.name}, ${brand.description}.
Your job is to research a keyword and return a structured content brief in JSON format only.
No explanation, no markdown, no backticks.`;
}

export function perplexityResearchUser(keyword: string): string {
  return `Research this keyword for a blog article: "${keyword}"

Return ONLY a JSON object with this exact structure:
{
  "keyword": "${keyword}",
  "search_intent": "informational/commercial/navigational",
  "target_audience": "brief description of who is searching this",
  "top_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"],
  "trending_angles": ["angle 1", "angle 2", "angle 3"],
  "content_gaps": ["gap 1", "gap 2", "gap 3"],
  "recent_developments": ["development 1", "development 2"],
  "competitor_titles": ["title 1", "title 2", "title 3"],
  "recommended_title": "suggested article title",
  "recommended_h2s": ["H2 1", "H2 2", "H2 3", "H2 4", "H2 5"],
  "key_terms_to_include": ["term 1", "term 2", "term 3", "term 4", "term 5"],
  "word_count_recommendation": 1200
}`;
}

export function claudeRelevanceSystem(brand: BrandConfig): string {
  return `You classify keyword relevance for ${brand.name}, ${brand.description}.
Return ONLY a JSON array of YES/NO, one per keyword, in the same order received.
No explanation, no markdown, no backticks.`;
}

export function claudeRelevanceUser(keywords: string[]): string {
  return `For each keyword below, reply YES if it is directly relevant to the platform, NO otherwise.
Return a JSON array of strings only, like ["YES","NO","YES",...].

Keywords:
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}`;
}

export function claudeOutlineSystem(brand: BrandConfig): string {
  return `You are an expert SEO content strategist for ${brand.domain}, ${brand.description}.
You create highly optimized article outlines that rank on Google and answer AI search engines like Perplexity and ChatGPT.
Always return valid JSON only. No explanation, no markdown, no backticks.`;
}

export function claudeOutlineUser(params: {
  keyword: string;
  searchVolume: number | null;
  brief: unknown;
}): string {
  return `Create a complete article outline for this topic.

Keyword: ${params.keyword}
Search volume: ${params.searchVolume ?? 'unknown'}
Research brief (JSON): ${JSON.stringify(params.brief)}

Return ONLY a JSON object with this exact structure:
{
  "title": "SEO optimized article title (60 chars max)",
  "slug": "url-friendly-slug",
  "meta_title": "SEO meta title (60 chars max)",
  "meta_description": "compelling meta description (155 chars max)",
  "primary_keyword": "${params.keyword}",
  "secondary_keywords": ["keyword 1", "keyword 2", "keyword 3"],
  "target_audience": "who this article is for",
  "search_intent": "informational|commercial|navigational",
  "word_count": 1400,
  "outline": {
    "introduction": "2 sentence summary of what the intro covers",
    "sections": [
      { "h2": "Section heading", "summary": "what this section covers in 1 sentence",
        "h3s": ["subsection 1", "subsection 2"], "word_count": 250 }
    ],
    "conclusion": "1 sentence summary of conclusion angle",
    "faq": [
      { "question": "FAQ question 1", "answer_summary": "brief answer" },
      { "question": "FAQ question 2", "answer_summary": "brief answer" },
      { "question": "FAQ question 3", "answer_summary": "brief answer" }
    ]
  },
  "internal_links": ["internal link topic 1", "internal link topic 2"],
  "cta_placement": "where to place signup CTA in the article",
  "estimated_read_time": "X min read"
}`;
}

export function claudeArticleSystem(brand: BrandConfig): string {
  return `You are an expert crypto futures trading writer for ${brand.domain}, ${brand.description}.

Writing rules:
- Write in a clear, confident, knowledgeable tone
- Target audience is ${brand.audience}
- Never use filler phrases like "in conclusion" or "it is worth noting"
- Always back claims with specific examples or numbers
- Naturally mention ${brand.name} once or twice where relevant — never forced
- Include the primary keyword in the first paragraph and at least 2 H2s
- Include secondary keywords naturally throughout
- Every H2 section should be meaty and valuable
- FAQ answers must be concise — 2-3 sentences max
- Return complete HTML only. No explanation, no markdown, no backticks.`;
}

export function claudeArticleUser(params: {
  keyword: string;
  secondaryKeywords: string[];
  outline: unknown;
  brief: unknown;
  ctaPlacement: string;
  ctaHtml: string;
  wordCount: number;
  searchIntent: string;
  audience: string;
}): string {
  return `Write a complete SEO and AEO optimized article.

Primary keyword: ${params.keyword}
Secondary keywords: ${JSON.stringify(params.secondaryKeywords)}
Target word count: ${params.wordCount}
Search intent: ${params.searchIntent}
Target audience: ${params.audience}

Article outline to follow exactly:
${JSON.stringify(params.outline, null, 2)}

Research brief key terms/developments:
${JSON.stringify(params.brief)}

CTA placement instruction:
${params.ctaPlacement}

CTA block to insert at indicated location (inline exactly as given):
${params.ctaHtml}

Return the complete article as clean HTML using these exact tags only:
- <h2> for section headings (start the article with the first H2 — the page frame renders the article title as H1)
- <h3> for subsections
- <p> for paragraphs
- <ul> and <li> for lists
- <strong> for emphasis
- <div class="faq-section"> wrapping all FAQs
- <div class="faq-item"> wrapping each FAQ
- <div class="faq-question"> for each question
- <div class="faq-answer"> for each answer
- <div class="xg-cta"> for the CTA block

Do not include <html>, <head>, <body>, <h1>, or any wrapper tags. Start directly with an opening paragraph or <h2>.`;
}
