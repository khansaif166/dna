import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, subTopics, topicResources } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const resourceSchema = z.object({
  mode: z.enum(['new', 'existing']).default('new'),
  intent: z.enum(['save', 'remove']).default('save'),
  topic_id: z.string().uuid(),
  sub_topic_id: z.string().uuid().optional(),
  title: z.string().trim().min(1),
  youtube_url: z.string().optional().or(z.literal('')).refine((value) => !value || z.string().url().safeParse(value).success, {
    message: 'Invalid YouTube URL',
  }),
  notes: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int().optional(),
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
    mode: formData.get('mode'),
    intent: formData.get('intent'),
    topic_id: formData.get('topic_id'),
    sub_topic_id: formData.get('sub_topic_id'),
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
      if (parsed.data.mode === 'new') {
        if (!parsed.data.youtube_url || parsed.data.order === undefined) {
          throw new Error('Missing topic or video details');
        }

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

        return;
      }

      if (!parsed.data.sub_topic_id) {
        throw new Error('Select an existing topic');
      }

      const subTopic = await tx.query.subTopics.findFirst({
        where: eq(subTopics.id, parsed.data.sub_topic_id),
      });

      if (!subTopic) {
        throw new Error('Selected topic was not found');
      }

      const existingVideo = await tx.query.topicResources.findFirst({
        where: (resource, { and, eq }) =>
          and(eq(resource.topicId, subTopic.topicId), eq(resource.order, subTopic.order)),
      });

      if (parsed.data.intent === 'remove') {
        if (existingVideo) {
          await tx.delete(topicResources).where(eq(topicResources.id, existingVideo.id));
        }

        return;
      }

      if (!parsed.data.youtube_url) {
        throw new Error('YouTube URL is required');
      }

      if (existingVideo) {
        await tx
          .update(topicResources)
          .set({
            title: subTopic.name,
            youtubeUrl: parsed.data.youtube_url,
            notes: parsed.data.notes || null,
            order: subTopic.order,
          })
          .where(eq(topicResources.id, existingVideo.id));

        return;
      }

      await tx.insert(topicResources).values({
        topicId: subTopic.topicId,
        title: subTopic.name,
        youtubeUrl: parsed.data.youtube_url,
        notes: parsed.data.notes || null,
        order: subTopic.order,
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
