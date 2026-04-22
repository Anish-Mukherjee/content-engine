// src/integrations/claude/client.ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
