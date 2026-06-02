import type { APIRoute } from 'astro';

import { hasValidOrigin } from '../../../lib/csrf';
import { requireAdminApi } from '../../../lib/requireAdminApi';
import { getAdminSupabase } from '../../../lib/supabase';

export const prerender = false;

const QUESTION_IMAGE_BUCKET = import.meta.env.SUPABASE_QUESTION_IMAGE_BUCKET || 'question-images';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureBucketExists() {
  const supabase = getAdminSupabase();
  const { data: existingBucket, error: getBucketError } = await supabase.storage.getBucket(QUESTION_IMAGE_BUCKET);

  if (existingBucket) {
    return { supabase, error: null as string | null };
  }

  // Some projects return a "not found" style error here before bucket creation.
  const { error: createBucketError } = await supabase.storage.createBucket(QUESTION_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    allowedMimeTypes: [...allowedMimeTypes],
  });

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    return {
      supabase,
      error: createBucketError.message || getBucketError?.message || 'Failed to initialize the image storage bucket.',
    };
  }

  return { supabase, error: null as string | null };
}

export const POST: APIRoute = async (context) => {
  if (!hasValidOrigin(context.request)) {
    return json('Forbidden', 403);
  }

  const auth = await requireAdminApi(context);

  if (auth instanceof Response) {
    return auth;
  }

  const formData = await context.request.formData();
  const file = formData.get('image');
  const testId = String(formData.get('test_id') ?? '').trim();

  if (!(file instanceof File)) {
    return json('Please choose an image to upload.', 400);
  }

  if (!testId) {
    return json('Missing test context for image upload.', 400);
  }

  if (file.size === 0) {
    return json('The selected image is empty.', 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return json('Image must be 5 MB or smaller.', 400);
  }

  if (!allowedMimeTypes.has(file.type)) {
    return json('Only JPG, PNG, WEBP, and GIF images are supported.', 400);
  }

  const safeFileName = sanitizeFileName(file.name || 'question-image');
  const objectPath = `tests/${testId}/${Date.now()}-${safeFileName}`;
  const { supabase, error: bucketError } = await ensureBucketExists();

  if (bucketError) {
    return json(bucketError, 400);
  }

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_IMAGE_BUCKET)
    .upload(objectPath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return json(uploadError.message || 'Failed to upload image.', 400);
  }

  const { data } = supabase.storage.from(QUESTION_IMAGE_BUCKET).getPublicUrl(objectPath);

  return json('Image uploaded successfully.', 200, {
    imageUrl: data.publicUrl,
    bucket: QUESTION_IMAGE_BUCKET,
  });
};

export const ALL: APIRoute = async () =>
  new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
