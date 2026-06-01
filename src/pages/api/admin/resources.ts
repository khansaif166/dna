import type { APIRoute } from 'astro';
import { z } from 'zod';

import { db, subTopics, topicResources } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const resourceSchema = z.object({
  topic_id: z.string().uuid(),
  title: z.string().trim().min(1),
  youtube_url: z.string().url(),
  notes: z.string().optional().or(z.literal('')),
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
  const parsed = resourceSchema.safeParse({
    topic_id: formData.get('topic_id'),
    title: formData.get('title'),
    youtube_url: formData.get('youtube_url'),
    notes: formData.get('notes'),
    order: formData.get('order'),
  });

  if (!parsed.success) {
    return new Response('Invalid resource input', { status: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(subTopics).values({
        topicId: parsed.data.topic_id,
        name: parsed.data.title,
        order: parsed.data.order,
      });

      await tx.insert(topicResources).values({
        topicId: parsed.data.topic_id,
        title: parsed.data.title,
        youtubeUrl: parsed.data.youtube_url,
        notes: parsed.data.notes || null,
        order: parsed.data.order,
      });
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to create resource', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/topics');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
