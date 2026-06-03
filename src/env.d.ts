/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    runtime?: {
      env?: Record<string, unknown>;
    };
    user: import('@supabase/supabase-js').User | null;
    profile: { id: string; fullName: string; role: 'student' | 'admin'; isActive: boolean } | null;
  }
}
