import type { APIRoute } from 'astro';

import { getAnonSupabase } from '../../lib/supabase';

export const prerender = false;

function redirect(request: Request, pathname: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(pathname, request.url).toString(),
    },
  });
}

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const code = url.searchParams.get('code');

  if (!code) {
    return redirect(request, '/login?error=verification_failed');
  }

  const supabase = getAnonSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session) {
    return redirect(request, '/login?error=verification_failed');
  }

  cookies.set('sb-access-token', session.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  cookies.set('sb-refresh-token', session.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return redirect(request, '/student');
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: {
      Allow: 'GET',
    },
  });
