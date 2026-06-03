import type { APIRoute } from 'astro';

import { getServerEnv } from '../../../lib/serverEnv';

export const prerender = false;

const requiredKeys = [
  'SITE',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_QUESTION_IMAGE_BUCKET',
  'DATABASE_URL',
  'APP_SECRET',
] as const;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const appSecret = getServerEnv('APP_SECRET');

  if (!appSecret || token !== appSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const payload = Object.fromEntries(
    requiredKeys.map((key) => [
      key,
      {
        present: Boolean(getServerEnv(key)),
      },
    ])
  );

  return Response.json(payload, {
    headers: {
      'cache-control': 'no-store',
    },
  });
};

