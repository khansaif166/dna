import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { requireServerEnv } from '../lib/serverEnv';

type Database = ReturnType<typeof drizzle<typeof schema>>;
type SqlClient = ReturnType<typeof postgres>;

let database: Database | null = null;
let client: SqlClient | null = null;
let databaseCreatedAt = 0;

const CLIENT_MAX_AGE_MS = 55 * 1000;

function shouldRequireSsl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return url.hostname !== 'localhost' && url.hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

function validateConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const isSupabaseHost = url.hostname.endsWith('.supabase.co') || url.hostname.includes('.pooler.supabase.com');
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const port = url.port || '5432';

    if (!isLocalHost && isSupabaseHost && port !== '6543') {
      throw new Error(
        'DATABASE_URL must use the Supabase transaction pooler connection string on port 6543 for Cloudflare Pages/serverless runtimes.'
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('DATABASE_URL is invalid.');
  }
}

function closeClient() {
  if (!client) {
    return;
  }

  void client.end({ timeout: 0 });
  client = null;
  database = null;
  databaseCreatedAt = 0;
}

function getDb(): Database {
  const now = Date.now();

  if (database && now - databaseCreatedAt < CLIENT_MAX_AGE_MS) {
    return database;
  }

  closeClient();

  const connectionString = requireServerEnv('DATABASE_URL');
  validateConnectionString(connectionString);
  client = postgres(connectionString, {
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60,
    ssl: shouldRequireSsl(connectionString) ? 'require' : undefined,
  });

  database = drizzle(client, { schema });
  databaseCreatedAt = now;
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

export * from './schema';
