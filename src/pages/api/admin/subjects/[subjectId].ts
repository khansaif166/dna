import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, subjects } from '../../../../db';
import { redirectToAdminReferrer } from '../../../../lib/admin';
import { hasValidOrigin } from '../../../../lib/csrf';
import { requireAdminApi } from '../../../../lib/requireAdminApi';

export const prerender = false;

const updateSubjectSchema = z.object({
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
  const parsed = updateSubjectSchema.safeParse({
    subject_id: formData.get('subject_id'),
    name: formData.get('name'),
    order: formData.get('order'),
  });

  if (!parsed.success || parsed.data.subject_id !== context.params.subjectId) {
    return new Response('Invalid subject update', { status: 400 });
  }

  try {
    await db
      .update(subjects)
      .set({
        name: parsed.data.name,
        order: parsed.data.order,
      })
      .where(eq(subjects.id, parsed.data.subject_id));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to update subject', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/subjects');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
