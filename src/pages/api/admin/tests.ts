import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, subTopics, tests, topics } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const createTestSchema = z.object({
  title: z.string().min(1),
  subject_id: z.string().uuid().nullable().optional(),
  topic_id: z.string().uuid().nullable().optional(),
  sub_topic_id: z.string().uuid().nullable().optional(),
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
    sub_topic_id: nullableUuid(formData.get('sub_topic_id')),
    duration_minutes: formData.get('duration_minutes'),
    test_type: formData.get('test_type'),
    attempt_mode: formData.get('attempt_mode'),
  });

  if (!parsed.success) {
    return new Response('Invalid test input', { status: 400 });
  }

  try {
    let resolvedSubjectId = parsed.data.subject_id ?? null;
    let resolvedTopicId = parsed.data.topic_id ?? null;

    if (parsed.data.sub_topic_id) {
      const subTopic = await db
        .select({
          id: subTopics.id,
          topicId: subTopics.topicId,
        })
        .from(subTopics)
        .where(eq(subTopics.id, parsed.data.sub_topic_id))
        .then((rows) => rows[0]);

      if (!subTopic) {
        return new Response('Invalid sub-topic input', { status: 400 });
      }

      if (resolvedTopicId && resolvedTopicId !== subTopic.topicId) {
        return new Response('Selected sub-topic does not belong to the chosen chapter', { status: 400 });
      }

      resolvedTopicId = subTopic.topicId;
    }

    if (resolvedTopicId) {
      const topic = await db
        .select({
          id: topics.id,
          subjectId: topics.subjectId,
        })
        .from(topics)
        .where(eq(topics.id, resolvedTopicId))
        .then((rows) => rows[0]);

      if (!topic) {
        return new Response('Invalid topic input', { status: 400 });
      }

      if (resolvedSubjectId && resolvedSubjectId !== topic.subjectId) {
        return new Response('Selected topic does not belong to the chosen subject', { status: 400 });
      }

      resolvedSubjectId = topic.subjectId;
    }

    await db.insert(tests).values({
      title: parsed.data.title,
      subjectId: resolvedSubjectId,
      topicId: resolvedTopicId,
      subTopicId: parsed.data.sub_topic_id ?? null,
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
