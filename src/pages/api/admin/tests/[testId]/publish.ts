import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, tests } from '../../../../../db';
import { redirectToAdminReferrer } from '../../../../../lib/admin';
import { hasValidOrigin } from '../../../../../lib/csrf';
import { requireAdminApi } from '../../../../../lib/requireAdminApi';

export const prerender = false;

const publishSchema = z.object({
  test_id: z.string().uuid(),
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
  const parsed = publishSchema.safeParse({
    test_id: formData.get('test_id'),
  });

  if (!parsed.success || parsed.data.test_id !== context.params.testId) {
    return new Response('Invalid publish input', { status: 400 });
  }

  const test = await db.select().from(tests).where(eq(tests.id, parsed.data.test_id)).then((rows) => rows[0]);

  if (!test) {
    return new Response('Test not found', { status: 400 });
  }

  try {
    await db
      .update(tests)
      .set({
        status: test.status === 'draft' ? 'published' : 'draft',
        publishedAt: test.status === 'draft' ? new Date() : null,
      })
      .where(eq(tests.id, test.id));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Failed to toggle publish state', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/tests');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
