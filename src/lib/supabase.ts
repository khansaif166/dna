import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from './serverEnv';

function getSupabaseUrl() {
  return requireServerEnv('SUPABASE_URL');
}

function getSupabaseAnonKey() {
  return requireServerEnv('SUPABASE_ANON_KEY');
}

function getSupabaseServiceRoleKey() {
  return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
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
