import type { APIContext } from 'astro';

import { loadProfileStatus } from './profileStatus';
import { getAdminSupabase, getUserSupabase } from './supabase';

type AdminAuthResult =
  | {
      id: string;
      fullName: string;
      role: 'admin';
    }
  | Response;

function jsonError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function requireAdminRouteAuth(context: APIContext): Promise<AdminAuthResult> {
  const accessToken = context.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return jsonError('Unauthorized', 401);
  }

  const {
    data: { user },
    error: userError,
  } = await getUserSupabase(accessToken).auth.getUser();

  if (userError || !user) {
    return jsonError('Unauthorized', 401);
  }

  const adminSupabase = getAdminSupabase();
  const { data: profile, error: profileError } = await loadProfileStatus(adminSupabase, user.id);

  if (profileError || !profile || profile.role !== 'admin') {
    return jsonError('Forbidden', 403);
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: 'admin',
  };
}

export function redirectToAdminReferrer(request: Request, fallbackPath = '/admin') {
  const referrer = request.headers.get('referer');

  return Response.redirect(new URL(referrer ?? fallbackPath, request.url), 302);
}
