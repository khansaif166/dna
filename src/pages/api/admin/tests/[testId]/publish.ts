import type { APIRoute } from 'astro';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db, questions, tests } from '../../../../../db';
import { redirectToAdminReferrer } from '../../../../../lib/admin';
import { hasValidOrigin } from '../../../../../lib/csrf';
import { requireAdminApi } from '../../../../../lib/requireAdminApi';
import { withTimeout } from '../../../../../lib/withTimeout';

export const prerender = false;

const publishSchema = z.object({
  test_id: z.string().uuid(),
});

export const POST: APIRoute = async (context) => {
  try {
    console.log('[admin-test-publish] request started', {
      path: context.url.pathname,
      testId: context.params.testId ?? null,
    });
    
    if (!hasValidOrigin(context.request)) {
      return new Response('Forbidden', { status: 403 });
    }

    const auth = await requireAdminApi(context);

    if (auth instanceof Response) {
      console.warn('[admin-test-publish] auth rejected request', {
        testId: context.params.testId ?? null,
        status: auth.status,
      });
      return auth;
    }

    const formData = await withTimeout(context.request.formData(), 'admin test publish formData');
    const parsed = publishSchema.safeParse({
      test_id: formData.get('test_id'),
    });

    if (!parsed.success || parsed.data.test_id !== context.params.testId) {
      console.warn('[admin-test-publish] invalid input', {
        testId: context.params.testId ?? null,
      });
      return new Response('Invalid publish input', { status: 400 });
    }

    const test = await withTimeout(
      db
        .select()
        .from(tests)
        .where(eq(tests.id, parsed.data.test_id))
        .then((rows) => rows[0]),
      'admin test publish test lookup'
    );

    if (!test) {
      return new Response('Test not found', { status: 400 });
    }

    if (test.status === 'draft') {
      const [questionCount, pendingAnswerCount] = await withTimeout(
        Promise.all([
          db
            .select({ id: questions.id })
            .from(questions)
            .where(eq(questions.testId, test.id))
            .limit(1),
          db
            .select({ id: questions.id })
            .from(questions)
            .where(and(eq(questions.testId, test.id), isNull(questions.correctOption)))
            .limit(1),
        ]),
        'admin test publish validation queries'
      );

      if (!questionCount.length) {
        return new Response('Add at least one question before publishing this test.', { status: 400 });
      }

      if (pendingAnswerCount.length) {
        return new Response('Cannot publish test until all questions have answer keys.', { status: 400 });
      }
    }

    await withTimeout(
      db
        .update(tests)
        .set({
          status: test.status === 'draft' ? 'published' : 'draft',
          publishedAt: test.status === 'draft' ? new Date() : null,
        })
        .where(eq(tests.id, test.id)),
      'admin test publish update'
    );
  } catch (error) {
    console.error('[admin-test-publish] failed', {
      path: context.url.pathname,
      testId: context.params.testId ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });

    return new Response(error instanceof Error ? error.message : 'Failed to toggle publish state', { status: 400 });
  }

  return redirectToAdminReferrer(context.request, '/admin/tests');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
