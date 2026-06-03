import type { APIRoute } from 'astro';
import { z } from 'zod';

import { hasValidOrigin } from '../../../lib/csrf';
import { getAdminSupabase } from '../../../lib/supabase';

export const prerender = false;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
});

function redirect(request: Request, pathname: string) {
  return Response.redirect(new URL(pathname, request.url), 302);
}

export const POST: APIRoute = async ({ request }) => {
  if (!hasValidOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const formData = await request.formData();
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    full_name: formData.get('full_name'),
  });

  if (!parsed.success) {
    return redirect(request, '/signup?error=invalid_input');
  }

  const { email, password, full_name: fullName } = parsed.data;
  const adminSupabase = getAdminSupabase();
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return redirect(request, '/signup?error=creation_failed');
  }

  return redirect(request, '/login?success=account_created');
};

export const ALL: APIRoute = async () => {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
};
