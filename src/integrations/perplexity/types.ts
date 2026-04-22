// src/integrations/perplexity/types.ts
export type PerplexityBrief = {
  keyword: string;
  search_intent: string;
  target_audience: string;
  top_questions: string[];
  trending_angles: string[];
  content_gaps: string[];
  recent_developments: string[];
  competitor_titles: string[];
  recommended_title: string;
  recommended_h2s: string[];
  key_terms_to_include: string[];
  word_count_recommendation: number;
};
