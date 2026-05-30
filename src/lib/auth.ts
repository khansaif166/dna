import type { AstroGlobal } from 'astro';

type Role = 'student' | 'admin';

type AuthProfile = NonNullable<AstroGlobal['locals']['profile']>;

export async function requireAuth(Astro: AstroGlobal, role?: Role): Promise<AuthProfile | Response> {
  const profile = Astro.locals.profile;

  if (!profile) {
    return Astro.redirect('/login');
  }

  if (role === 'admin' && profile.role !== 'admin') {
    return Astro.redirect('/student');
  }

  if (role === 'student' && profile.role !== 'student') {
    return Astro.redirect('/admin');
  }

  return profile;
}
