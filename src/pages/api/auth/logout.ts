import type { APIRoute } from 'astro';

import { hasValidOrigin } from '../../../lib/csrf';

export const prerender = false;

function redirect(request: Request, pathname: string) {
  return Response.redirect(new URL(pathname, request.url), 302);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!hasValidOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  cookies.set('sb-access-token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  cookies.set('sb-refresh-token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return redirect(request, '/login');
};

export const ALL: APIRoute = async () => {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
};
