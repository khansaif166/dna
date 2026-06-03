import type { APIContext } from 'astro';

import { loadProfileStatus } from './profileStatus';
import { getAdminSupabase } from './supabase';

export async function requireAdminApi(context: APIContext) {
  const token = context.cookies.get('sb-access-token')?.value;

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getAdminSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: profile } = await loadProfileStatus(supabase, user.id);

  if (!profile || profile.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  return { user, profile };
}
