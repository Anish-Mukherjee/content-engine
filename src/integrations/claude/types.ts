// src/integrations/claude/types.ts
export type ArticleOutline = {
  title: string;
  slug: string;
  meta_title: string;
  meta_description: string;
  primary_keyword: string;
  secondary_keywords: string[];
  target_audience: string;
  search_intent: string;
  word_count: number;
  outline: {
    h1: string;
    introduction: string;
    sections: Array<{ h2: string; summary: string; h3s: string[]; word_count: number }>;
    conclusion: string;
    faq: Array<{ question: string; answer_summary: string }>;
  };
  internal_links: string[];
  cta_placement: string;
  estimated_read_time: string;
};
