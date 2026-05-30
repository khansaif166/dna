import type { APIRoute } from 'astro';
import { z } from 'zod';

import { db, tests } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const createTestSchema = z.object({
  title: z.string().min(1),
  subject_id: z.string().uuid().nullable().optional(),
  topic_id: z.string().uuid().nullable().optional(),
  duration_minutes: z.coerce.number().int().positive(),
  test_type: z.enum(['topic_practice', 'mock_exam']),
  attempt_mode: z.enum(['single', 'multiple']),
});

function nullableUuid(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value ? value : null;
}

export const POST: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const formData = await context.request.formData();
  const parsed = createTestSchema.safeParse({
    title: formData.get('title'),
    subject_id: nullableUuid(formData.get('subject_id')),
    topic_id: nullableUuid(formData.get('topic_id')),
    duration_minutes: formData.get('duration_minutes'),
    test_type: formData.get('test_type'),
    attempt_mode: formData.get('attempt_mode'),
  });

  if (!parsed.success) {
    return new Response('Invalid test input', { status: 400 });
  }

  try {
    await db.insert(tests).values({
      title: parsed.data.title,
      subjectId: parsed.data.subject_id ?? null,
      topicId: parsed.data.topic_id ?? null,
      durationMinutes: parsed.data.duration_minutes,
      testType: parsed.data.test_type,
      attemptMode: parsed.data.attempt_mode,
      status: 'draft',
      createdBy: auth.user.id,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to create test', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/tests');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
