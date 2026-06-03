import type { APIRoute } from 'astro';
import { eq, inArray } from 'drizzle-orm';

import { attemptAnswers, db, questions, testAttempts, tests } from '../../../../db';
import { hasValidOrigin } from '../../../../lib/csrf';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

function json(message: string, status: number) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export const DELETE: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return json('Forbidden', 403);
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const { testId } = context.params;

  if (!testId) {
    return json('Test not found.', 404);
  }

  const existingTest = await db.select({ id: tests.id }).from(tests).where(eq(tests.id, testId)).limit(1);

  if (!existingTest.length) {
    return json('Test not found.', 404);
  }

  try {
    await db.transaction(async (tx) => {
      const attempts = await tx
        .select({ id: testAttempts.id })
        .from(testAttempts)
        .where(eq(testAttempts.testId, testId));

      const attemptIds = attempts.map((attempt) => attempt.id);

      if (attemptIds.length) {
        await tx.delete(attemptAnswers).where(inArray(attemptAnswers.attemptId, attemptIds));
      }

      await tx.delete(testAttempts).where(eq(testAttempts.testId, testId));
      await tx.delete(questions).where(eq(questions.testId, testId));
      await tx.delete(tests).where(eq(tests.id, testId));
    });
  } catch (error) {
    return json(error instanceof Error ? error.message : 'Failed to delete test.', 400);
  }

  return json('Test deleted successfully.', 200);
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'DELETE' },
  });
