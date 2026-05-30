import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  const url = import.meta.env.SUPABASE_URL;

  if (!url) {
    throw new Error('SUPABASE_URL is required.');
  }

  return url;
}

function getSupabaseAnonKey() {
  const key = import.meta.env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error('SUPABASE_ANON_KEY is required.');
  }

  return key;
}

function getSupabaseServiceRoleKey() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  }

  return key;
}

export function getUserSupabase(accessToken: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getAnonSupabase() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getAdminSupabase() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
