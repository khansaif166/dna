import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { getServerBinding, requireServerEnv } from '../lib/serverEnv';

type Database = ReturnType<typeof drizzle<typeof schema>>;
type SqlClient = ReturnType<typeof postgres>;
type HyperdriveBinding = {
  connectionString?: string;
};

let database: Database | null = null;
let client: SqlClient | null = null;
let currentConnectionString: string | null = null;

function getDatabaseUrl(hyperdrive?: HyperdriveBinding) {
  const runtimeHyperdrive = hyperdrive ?? getServerBinding<HyperdriveBinding>('HYPERDRIVE');

  if (runtimeHyperdrive?.connectionString) {
    return runtimeHyperdrive.connectionString;
  }

  return requireServerEnv('DATABASE_URL');
}

export function getDb(hyperdrive?: HyperdriveBinding): Database {
  const connectionString = getDatabaseUrl(hyperdrive);

  if (database && currentConnectionString === connectionString) {
    return database;
  }

  client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
  });

  database = drizzle(client, { schema });
  currentConnectionString = connectionString;
  return database;
}

export async function closeDb() {
  if (!client) {
    return;
  }

  const activeClient = client;
  client = null;
  database = null;
  currentConnectionString = null;

  await activeClient.end({ timeout: 1 });
}

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

export * from './schema';
