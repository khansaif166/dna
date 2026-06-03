import type { APIRoute } from 'astro';
import { z } from 'zod';

import { hasValidOrigin } from '../../../lib/csrf';
import { loadProfileStatus } from '../../../lib/profileStatus';
import { getAdminSupabase, getAnonSupabase } from '../../../lib/supabase';

export const prerender = false;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function redirect(request: Request, pathname: string) {
  return Response.redirect(new URL(pathname, request.url), 302);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!hasValidOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return redirect(request, '/login?error=invalid_input');
  }

  const { email, password } = parsed.data;

  const supabase = getAnonSupabase();

  const {
    data: { session, user },
    error,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !session || !user) {
    return redirect(request, '/login?error=invalid_credentials');
  }

  const adminSupabase = getAdminSupabase();
  const { data: profile } = await loadProfileStatus(adminSupabase, user.id);

  if (!profile) {
    return redirect(request, '/login?error=invalid_credentials');
  }

  if (profile.role === 'student' && !profile.is_active) {
    return redirect(request, '/login?error=account_disabled');
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

  return redirect(request, profile?.role === 'admin' ? '/admin' : '/student');
};

export const ALL: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
};
