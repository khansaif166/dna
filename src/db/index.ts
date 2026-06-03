import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { requireServerEnv } from '../lib/serverEnv';

const connectionString = requireServerEnv('DATABASE_URL');

const client = postgres(connectionString, {
  prepare: false,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export * from './schema';
