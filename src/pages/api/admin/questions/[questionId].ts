import type { APIRoute } from 'astro';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { attemptAnswers, db, questions } from '../../../../db';
import { hasValidOrigin } from '../../../../lib/csrf';
import { getUuidParam } from '../../../../lib/routeParams';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

const questionUpdateSchema = z
  .object({
    prompt: z.string().min(1),
    question_image_url: z.string().trim().url().optional().or(z.literal('')),
    option_a: z.string().min(1),
    option_b: z.string().min(1),
    option_c: z.string().min(1),
    option_d: z.string().min(1),
    correct_option: z.enum(['a', 'b', 'c', 'd']).optional().or(z.literal('')),
    explanation: z.string().optional().or(z.literal('')),
    order: z.coerce.number().int(),
  })
  .superRefine((data, ctx) => {
    const normalizedOptions = [
      { key: 'option_a', value: data.option_a.trim().toLowerCase() },
      { key: 'option_b', value: data.option_b.trim().toLowerCase() },
      { key: 'option_c', value: data.option_c.trim().toLowerCase() },
      { key: 'option_d', value: data.option_d.trim().toLowerCase() },
    ];

    const seen = new Map<string, string>();

    for (const option of normalizedOptions) {
      const duplicateOf = seen.get(option.value);

      if (duplicateOf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [option.key],
          message: 'Each option must be unique.',
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [duplicateOf],
          message: 'Each option must be unique.',
        });
        return;
      }

      seen.set(option.value, option.key);
    }
  });

function json(message: string, status: number) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function getFriendlyQuestionUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to update question.';

  if (
    message.includes('null value in column "correct_option"') ||
    message.includes('questions_correct_option_not_null')
  ) {
    return 'Your database still requires a correct answer for every question. Apply the latest migration to allow pending answer keys.';
  }

  return message;
}

async function requireQuestion(questionId: string) {
  const existing = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  return existing[0] ?? null;
}

export const PATCH: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return json('Forbidden', 403);
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const questionId = getUuidParam(context.params.questionId, {
    response: json('Question not found.', 404),
  });

  if (questionId instanceof Response) {
    return questionId;
  }

  const existingQuestion = await requireQuestion(questionId);

  if (!existingQuestion) {
    return json('Question not found.', 404);
  }

  const formData = await context.request.formData();
  const parsed = questionUpdateSchema.safeParse({
    prompt: formData.get('prompt'),
    question_image_url: formData.get('question_image_url'),
    option_a: formData.get('option_a'),
    option_b: formData.get('option_b'),
    option_c: formData.get('option_c'),
    option_d: formData.get('option_d'),
    correct_option: typeof formData.get('correct_option') === 'string' ? formData.get('correct_option') : '',
    explanation: formData.get('explanation'),
    order: formData.get('order'),
  });

  if (!parsed.success) {
    const duplicateError = parsed.error.issues.find((issue) => issue.message === 'Each option must be unique.');
    return json(duplicateError?.message ?? 'Invalid question input.', 400);
  }

  const conflictingOrder = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.testId, existingQuestion.testId),
        eq(questions.order, parsed.data.order),
        ne(questions.id, questionId)
      )
    )
    .limit(1);

  if (conflictingOrder[0]) {
    return json(`Question order ${parsed.data.order} is already in use for this test.`, 400);
  }

  try {
    await db
      .update(questions)
      .set({
        prompt: parsed.data.prompt,
        questionImageUrl: parsed.data.question_image_url || null,
        optionA: parsed.data.option_a,
        optionB: parsed.data.option_b,
        optionC: parsed.data.option_c,
        optionD: parsed.data.option_d,
        correctOption: parsed.data.correct_option || null,
        explanation: parsed.data.explanation || null,
        order: parsed.data.order,
      })
      .where(eq(questions.id, questionId));
  } catch (error) {
    return json(getFriendlyQuestionUpdateError(error), 400);
  }

  return json('Question updated successfully.', 200);
};

export const DELETE: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return json('Forbidden', 403);
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const questionId = getUuidParam(context.params.questionId, {
    response: json('Question not found.', 404),
  });

  if (questionId instanceof Response) {
    return questionId;
  }

  const existingQuestion = await requireQuestion(questionId);

  if (!existingQuestion) {
    return json('Question not found.', 404);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(attemptAnswers).where(eq(attemptAnswers.questionId, questionId));
      await tx.delete(questions).where(eq(questions.id, questionId));
      await tx
        .update(questions)
        .set({
          order: sql`${questions.order} + 10000`,
        })
        .where(and(eq(questions.testId, existingQuestion.testId), gt(questions.order, existingQuestion.order)));

      await tx
        .update(questions)
        .set({
          order: sql`${questions.order} - 10001`,
        })
        .where(and(eq(questions.testId, existingQuestion.testId), gt(questions.order, 10000)));
    });
  } catch (error) {
    return json(error instanceof Error ? error.message : 'Failed to delete question.', 400);
  }

  return json('Question deleted successfully.', 200);
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'PATCH, DELETE' },
  });
