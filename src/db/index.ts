import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import type {PostgresJsDatabase} from 'drizzle-orm/postgres-js';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __db: PostgresJsDatabase<typeof schema> | undefined;
}

export const getDb = (): PostgresJsDatabase<typeof schema> => {
  if (globalThis.__db) return globalThis.__db;
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local (dev) or your hosting environment (prod).',
    );
  }
  const client = postgres(url, {
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 15,
    max: 5,
  });
  globalThis.__db = drizzle(client, {schema});
  return globalThis.__db;
};
