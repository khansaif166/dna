import type { APIRoute } from 'astro';
import { z } from 'zod';

import { db, subjects } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

const subjectSchema = z.object({
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
  const parsed = subjectSchema.safeParse({
    name: formData.get('name'),
    order: formData.get('order'),
  });

  if (!parsed.success) {
    return new Response('Invalid subject input', { status: 400 });
  }

  try {
    await db.insert(subjects).values(parsed.data);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to create subject', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/subjects');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
