import { sql } from 'drizzle-orm';

import { db } from '../db';

export async function hasProfileIsActiveColumn() {
  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_active'
    ) as exists
  `);

  const row = result[0] as { exists: boolean } | undefined;
  return Boolean(row?.exists);
}
