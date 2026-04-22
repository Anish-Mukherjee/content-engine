// src/config/models.ts
export const MODELS = {
  relevance: 'claude-haiku-4-5-20251001',
  outline:   'claude-sonnet-4-6',
  article:   'claude-opus-4-7',
} as const;

export type ModelStage = keyof typeof MODELS;
