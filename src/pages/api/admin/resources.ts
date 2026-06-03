import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, subTopics, topicResources } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const newResourceSchema = z.object({
  mode: z.literal('new').default('new'),
  intent: z.literal('save').default('save'),
  topic_id: z.string().uuid(),
  title: z.string().trim().min(1),
  youtube_url: z
    .string()
    .refine((value) => z.string().url().safeParse(value).success, {
      message: 'Invalid YouTube URL',
    }),
  notes: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int().min(1),
});

const existingSaveResourceSchema = z.object({
  mode: z.literal('existing'),
  intent: z.literal('save').default('save'),
  sub_topic_id: z.string().uuid(),
  youtube_url: z
    .string()
    .refine((value) => z.string().url().safeParse(value).success, {
      message: 'Invalid YouTube URL',
    }),
  notes: z.string().optional().or(z.literal('')),
});

const existingRemoveResourceSchema = z.object({
  mode: z.literal('existing'),
  intent: z.literal('remove'),
  sub_topic_id: z.string().uuid(),
});

const resourceSchema = z.discriminatedUnion('mode', [
  newResourceSchema,
  z.discriminatedUnion('intent', [existingSaveResourceSchema, existingRemoveResourceSchema]),
]);

function redirectWithError(request: Request, message: string) {
  const referrer = request.headers.get('referer');
  const url = new URL(referrer ?? '/admin/subjects', request.url);
  url.searchParams.set('error', message);
  return Response.redirect(url, 302);
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
    return redirectWithError(context.request, 'invalid_resource_input');
  }

  try {
    await db.transaction(async (tx) => {
      if (parsed.data.mode === 'new') {
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
    return redirectWithError(
      context.request,
      error instanceof Error ? error.message : 'failed_to_create_resource'
    );
  }

  return redirectToAdminReferrer(context.request, '/admin/topics');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
