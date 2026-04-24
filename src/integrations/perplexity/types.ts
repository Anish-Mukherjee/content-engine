// src/integrations/perplexity/types.ts
export type PerplexityCompetitor = {
  title: string;
  url: string;
  strengths: string[];
  weaknesses: string[];
  word_count: number;
  tone: string;
};

export type PerplexityBrief = {
  keyword: string;
  search_intent: string;
  target_audience: string;
  top_3_competitors: PerplexityCompetitor[];
  winning_angle: string;
  unique_hook: string;
  content_gaps: string[];
  questions_to_answer: string[];
  key_stats_to_include: string[];
  recommended_tone: string;
  recommended_title: string;
  recommended_h2s: string[];
  key_terms_to_include: string[];
  word_count_recommendation: number;
  faq_questions: string[];
};
