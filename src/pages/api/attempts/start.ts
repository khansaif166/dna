import type { APIRoute } from 'astro';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { db, testAttempts, tests } from '../../../db';
import { getUserSupabase } from '../../../lib/supabase';

export const prerender = false;

const startAttemptSchema = z.object({
  testId: z.string().uuid(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return json({ error: 'unauthorized' }, 401);
  }

  const {
    data: { user },
    error: userError,
  } = await getUserSupabase(accessToken).auth.getUser();

  if (userError || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const parsed = startAttemptSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return json({ error: 'invalid_input' }, 400);
  }

  const { testId } = parsed.data;

  const test = await db.select().from(tests).where(eq(tests.id, testId)).then((rows) => rows[0]);

  if (!test || test.status !== 'published') {
    return json({ error: 'invalid_test' }, 400);
  }

  if (test.attemptMode === 'single') {
    const existingAttempt = await db
      .select({ id: testAttempts.id })
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.studentId, user.id),
          eq(testAttempts.testId, test.id),
          isNotNull(testAttempts.submittedAt)
        )
      )
      .then((rows) => rows[0]);

    if (existingAttempt) {
      return json({ error: 'already_attempted' }, 409);
    }
  }

  const [attempt] = await db
    .insert(testAttempts)
    .values({
      studentId: user.id,
      testId: test.id,
      startedAt: new Date(),
    })
    .returning({ id: testAttempts.id });

  return json({ attemptId: attempt.id });
};

export const ALL: APIRoute = async () => {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
};
