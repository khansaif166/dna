import type { APIRoute } from 'astro';
import { z } from 'zod';

import { db, topics } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const topicSchema = z.object({
  subject_id: z.string().uuid(),
  name: z.string().min(1),
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
  const parsed = topicSchema.safeParse({
    subject_id: formData.get('subject_id'),
    name: formData.get('name'),
    order: formData.get('order'),
  });

  if (!parsed.success) {
    return new Response('Invalid topic input', { status: 400 });
  }

  try {
    await db.insert(topics).values({
      subjectId: parsed.data.subject_id,
      name: parsed.data.name,
      order: parsed.data.order,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to create topic', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/topics');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
