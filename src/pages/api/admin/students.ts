import type { APIRoute } from 'astro';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { attemptAnswers, db, profiles, testAttempts } from '../../../db';
import { redirectToAdminReferrer } from '../../../lib/admin';
import { hasValidOrigin } from '../../../lib/csrf';
import { hasProfileIsActiveColumn } from '../../../lib/profileColumns';
import { requireAdminApi } from '../../../lib/requireAdminApi';
import { getAdminSupabase } from '../../../lib/supabase';

export const prerender = false;

const createStudentSchema = z.object({
  action: z.literal('create'),
  full_name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const toggleStudentSchema = z.object({
  action: z.enum(['disable', 'enable']),
  student_id: z.string().uuid(),
});

const deleteStudentSchema = z.object({
  action: z.literal('delete'),
  student_id: z.string().uuid(),
});

async function ensureStudent(studentId: string) {
  const [student] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, studentId))
    .limit(1);

  return student?.role === 'student' ? student : null;
}

async function createStudent(formData: FormData, request: Request) {
  const parsed = createStudentSchema.safeParse({
    action: formData.get('action'),
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return new Response('Invalid student input', { status: 400 });
  }

  const adminSupabase = getAdminSupabase();
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (error || !data.user) {
    return new Response(error?.message ?? 'Failed to create student', { status: 400 });
  }

  return redirectToAdminReferrer(request, '/admin/students');
}

async function toggleStudent(formData: FormData, request: Request) {
  const parsed = toggleStudentSchema.safeParse({
    action: formData.get('action'),
    student_id: formData.get('student_id'),
  });

  if (!parsed.success) {
    return new Response('Invalid student action', { status: 400 });
  }

  const student = await ensureStudent(parsed.data.student_id);

  if (!student) {
    return new Response('Student not found', { status: 404 });
  }

  if (!(await hasProfileIsActiveColumn())) {
    return new Response('Student disable/enable needs the latest database migration.', { status: 400 });
  }

  await db
    .update(profiles)
    .set({ isActive: parsed.data.action === 'enable' })
    .where(eq(profiles.id, parsed.data.student_id));

  return redirectToAdminReferrer(request, '/admin/students');
}

async function deleteStudent(formData: FormData, request: Request) {
  const parsed = deleteStudentSchema.safeParse({
    action: formData.get('action'),
    student_id: formData.get('student_id'),
  });

  if (!parsed.success) {
    return new Response('Invalid delete request', { status: 400 });
  }

  const student = await ensureStudent(parsed.data.student_id);

  if (!student) {
    return new Response('Student not found', { status: 404 });
  }

  const attempts = await db
    .select({ id: testAttempts.id })
    .from(testAttempts)
    .where(eq(testAttempts.studentId, parsed.data.student_id));

  const attemptIds = attempts.map((attempt) => attempt.id);

  await db.transaction(async (tx) => {
    if (attemptIds.length > 0) {
      await tx.delete(attemptAnswers).where(inArray(attemptAnswers.attemptId, attemptIds));
      await tx.delete(testAttempts).where(inArray(testAttempts.id, attemptIds));
    }

    await tx.delete(profiles).where(eq(profiles.id, parsed.data.student_id));
  });

  const adminSupabase = getAdminSupabase();
  const { error } = await adminSupabase.auth.admin.deleteUser(parsed.data.student_id);

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return redirectToAdminReferrer(request, '/admin/students');
}

export const POST: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const formData = await context.request.formData();
  const action = formData.get('action');

  if (action === 'create') {
    return createStudent(formData, context.request);
  }

  if (action === 'disable' || action === 'enable') {
    return toggleStudent(formData, context.request);
  }

  if (action === 'delete') {
    return deleteStudent(formData, context.request);
  }

  return new Response('Unsupported action', { status: 400 });
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
