// src/integrations/google-indexing/client.ts
import { google } from 'googleapis';

let cached: ReturnType<typeof google.indexing> | null = null;

export function indexingClient() {
  if (!cached) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });
    cached = google.indexing({ version: 'v3', auth });
  }
  return cached;
}
