import type { APIContext } from 'astro';

import { loadProfileStatus } from './profileStatus';
import { getAdminSupabase, getUserSupabase } from './supabase';
import { withTimeout } from './withTimeout';

export async function requireAdminApi(context: APIContext) {
  const token = context.cookies.get('sb-access-token')?.value;

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await withTimeout(
    getUserSupabase(token).auth.getUser(),
    'admin api auth getUser'
  );

  if (error || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const adminSupabase = getAdminSupabase();
  const { data: profile, error: profileError } = await withTimeout(
    loadProfileStatus(adminSupabase, user.id),
    'admin api profile lookup'
  );

  if (profileError || !profile || profile.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  return { user, profile };
}
