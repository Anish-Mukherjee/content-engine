// src/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env';
import * as schema from './schema';

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!dbInstance) {
    client = postgres(env().DATABASE_URL, { max: 10 });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export async function closeDb() {
  if (client) await client.end();
  client = null;
  dbInstance = null;
}
