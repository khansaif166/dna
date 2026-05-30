import type { APIRoute } from 'astro';
import { z } from 'zod';

import { db, questions } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const questionSchema = z.object({
  test_id: z.string().uuid(),
  prompt: z.string().min(1),
  option_a: z.string().min(1),
  option_b: z.string().min(1),
  option_c: z.string().min(1),
  option_d: z.string().min(1),
  correct_option: z.enum(['a', 'b', 'c', 'd']),
  explanation: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int(),
});

export const POST: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const formData = await context.request.formData();
  const parsed = questionSchema.safeParse({
    test_id: formData.get('test_id'),
    prompt: formData.get('prompt'),
    option_a: formData.get('option_a'),
    option_b: formData.get('option_b'),
    option_c: formData.get('option_c'),
    option_d: formData.get('option_d'),
    correct_option: formData.get('correct_option'),
    explanation: formData.get('explanation'),
    order: formData.get('order'),
  });

  if (!parsed.success) {
    return new Response('Invalid question input', { status: 400 });
  }

  try {
    await db.insert(questions).values({
      testId: parsed.data.test_id,
      prompt: parsed.data.prompt,
      optionA: parsed.data.option_a,
      optionB: parsed.data.option_b,
      optionC: parsed.data.option_c,
      optionD: parsed.data.option_d,
      correctOption: parsed.data.correct_option,
      explanation: parsed.data.explanation || null,
      order: parsed.data.order,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to create question', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/tests');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
