import { defineConfig } from 'drizzle-kit';

const config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  pool: {
    prepare: false,
  },
};

export default defineConfig(config);
