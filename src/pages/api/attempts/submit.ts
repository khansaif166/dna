import type { APIRoute } from 'astro';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { attemptAnswers, db, questions, testAttempts } from '../../../db';
import { getUserSupabase } from '../../../lib/supabase';

export const prerender = false;

const submitAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.enum(['a', 'b', 'c', 'd']).nullable()),
  answerTimings: z.record(z.string().uuid(), z.number().int().min(0).nullable()),
  timeTakenSeconds: z.number().int().min(0),
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

  const parsed = submitAttemptSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return json({ error: 'invalid_input' }, 400);
  }

  const { attemptId, answers, answerTimings, timeTakenSeconds } = parsed.data;

  const attempt = await db
    .select()
    .from(testAttempts)
    .where(eq(testAttempts.id, attemptId))
    .then((rows) => rows[0]);

  if (!attempt) {
    return json({ error: 'not_found' }, 404);
  }

  if (attempt.studentId !== user.id) {
    return json({ error: 'forbidden' }, 403);
  }

  if (attempt.submittedAt) {
    return json({ error: 'already_submitted' }, 409);
  }

  const testQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, attempt.testId))
    .orderBy(questions.order);

  let score = 0;

  for (const question of testQuestions) {
    if (answers[question.id] === question.correctOption) {
      score += 1;
    }
  }

  const answerRows = testQuestions.map((question) => {
    const chosenOption = answers[question.id] ?? null;

    return {
      attemptId: attempt.id,
      questionId: question.id,
      attemptedAtSeconds: answerTimings[question.id] ?? null,
      chosenOption,
      isCorrect: chosenOption === question.correctOption,
    };
  });

  const submittedAt = new Date();

  try {
    await db.transaction(async (tx) => {
      const updatedAttempts = await tx
        .update(testAttempts)
        .set({
          submittedAt,
          timeTakenSeconds,
          score,
          totalQuestions: testQuestions.length,
        })
        .where(and(eq(testAttempts.id, attempt.id), eq(testAttempts.studentId, user.id), isNull(testAttempts.submittedAt)))
        .returning({ id: testAttempts.id });

      if (!updatedAttempts.length) {
        throw new Error('ATTEMPT_ALREADY_SUBMITTED');
      }

      if (answerRows.length) {
        await tx.insert(attemptAnswers).values(answerRows);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ATTEMPT_ALREADY_SUBMITTED') {
      return json({ error: 'already_submitted' }, 409);
    }

    throw error;
  }

  return json({
    attemptId: attempt.id,
    score,
    total: testQuestions.length,
  });
};

export const ALL: APIRoute = async () => {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
};
