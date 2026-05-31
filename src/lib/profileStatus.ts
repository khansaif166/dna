import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileStatus = {
  id: string;
  full_name?: string;
  role: 'student' | 'admin';
  is_active: boolean;
};

export async function loadProfileStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: ProfileStatus | null; error: Error | null }> {
  const profileWithStatus = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!profileWithStatus.error) {
    return {
      data: profileWithStatus.data as ProfileStatus | null,
      error: null,
    };
  }

  if (!profileWithStatus.error.message.includes('is_active')) {
    return {
      data: null,
      error: profileWithStatus.error,
    };
  }

  const fallbackProfile = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (fallbackProfile.error || !fallbackProfile.data) {
    return {
      data: null,
      error: fallbackProfile.error,
    };
  }

  return {
    data: {
      ...fallbackProfile.data,
      is_active: true,
    } as ProfileStatus,
    error: null,
  };
}
