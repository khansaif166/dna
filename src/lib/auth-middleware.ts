import type { MiddlewareHandler } from 'astro';

import { getAnonSupabase, getUserSupabase } from './supabase';

async function loadProfile(accessToken: string, userId: string) {
  const supabase = getUserSupabase(accessToken);
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  return profile
    ? {
        id: profile.id,
        fullName: profile.full_name,
        role: profile.role,
      }
    : null;
}

export const authMiddleware: MiddlewareHandler = async (context, next) => {
  context.locals.user = null;
  context.locals.profile = null;

  const isPrerendered = Boolean((context as { _isPrerendered?: boolean })._isPrerendered);

  if (isPrerendered) {
    return next();
  }

  const accessToken = context.cookies.get('sb-access-token')?.value;

  if (accessToken) {
    try {
      const supabase = getUserSupabase(accessToken);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!userError && user) {
        context.locals.user = user;
        context.locals.profile = await loadProfile(accessToken, user.id);
      } else {
        const refreshToken = context.cookies.get('sb-refresh-token')?.value;

        if (refreshToken) {
          const refreshClient = getAnonSupabase();
          const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
            refresh_token: refreshToken,
          });
          const refreshedSession = refreshData.session;
          const refreshedUser = refreshData.user ?? refreshedSession?.user ?? null;

          if (!refreshError && refreshedSession && refreshedUser) {
            context.cookies.set('sb-access-token', refreshedSession.access_token, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 7,
            });

            context.cookies.set('sb-refresh-token', refreshedSession.refresh_token, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 30,
            });

            context.locals.user = refreshedUser;
            context.locals.profile = await loadProfile(refreshedSession.access_token, refreshedUser.id);
          }
        }
      }
    } catch {
      context.locals.user = null;
      context.locals.profile = null;
    }
  }

  return next();
};
