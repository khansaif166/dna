import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { requireServerEnv } from '../lib/serverEnv';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let database: Database | null = null;

function getDb(): Database {
  if (database) {
    return database;
  }

  const connectionString = requireServerEnv('DATABASE_URL');
  const client = postgres(connectionString, {
    prepare: false,
    connect_timeout: 10,
  });

  database = drizzle(client, { schema });
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

export * from './schema';
