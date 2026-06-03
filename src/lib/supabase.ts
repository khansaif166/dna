import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from './serverEnv';

type SupabaseClientFactory = ReturnType<typeof createClient>;

function getSupabaseUrl() {
  return requireServerEnv('SUPABASE_URL');
}

function getSupabaseAnonKey() {
  return requireServerEnv('SUPABASE_ANON_KEY');
}

function getSupabaseServiceRoleKey() {
  return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
}

let anonClient: SupabaseClientFactory | null = null;
let adminClient: SupabaseClientFactory | null = null;

function getSupabaseAuthConfig() {
  return {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  } as const;
}

export function getUserSupabase(accessToken: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: getSupabaseAuthConfig(),
  });
}

export function getAnonSupabase() {
  if (anonClient) {
    return anonClient;
  }

  anonClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: getSupabaseAuthConfig(),
  });

  return anonClient;
}

export function getAdminSupabase() {
  if (adminClient) {
    return adminClient;
  }

  adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: getSupabaseAuthConfig(),
  });

  return adminClient;
}
