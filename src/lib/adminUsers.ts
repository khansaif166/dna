import { getAdminSupabase } from './supabase';

type AuthUserEmail = {
  id: string;
  email: string | null;
};

export async function listAuthUserEmailsById(): Promise<Map<string, string>> {
  try {
    const adminSupabase = getAdminSupabase();
    const allUsers: AuthUserEmail[] = [];
    let page = 1;

    while (true) {
      const { data, error } = await adminSupabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error) {
        console.error('[adminUsers] listUsers failed', error.message);
        break;
      }

      const users = data?.users ?? [];

      if (users.length === 0) {
        break;
      }

      allUsers.push(...users.map((user) => ({ id: user.id, email: user.email ?? null })));

      if (users.length < 1000) {
        break;
      }

      page += 1;
    }

    return new Map(
      allUsers.map((user) => [user.id, user.email ?? '-'])
    );
  } catch (error) {
    console.error('[adminUsers] failed to create admin supabase client', error);
    return new Map();
  }
}

export async function getAuthUserEmailById(userId: string): Promise<string | null> {
  try {
    const adminSupabase = getAdminSupabase();
    const { data, error } = await adminSupabase.auth.admin.getUserById(userId);

    if (error) {
      console.error('[adminUsers] getUserById failed', error.message);
      return null;
    }

    return data.user?.email ?? null;
  } catch (error) {
    console.error('[adminUsers] failed to create admin supabase client', error);
    return null;
  }
}
