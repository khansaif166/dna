import type { APIRoute } from 'astro';

import { hasValidOrigin } from '../../../lib/csrf';
import {
  allowedQuestionImageMimeTypes,
  ensureQuestionImageBucketExists,
  MAX_QUESTION_IMAGE_SIZE_BYTES,
  QUESTION_IMAGE_BUCKET,
  sanitizeQuestionImageFileName,
} from '../../../lib/questionImages';
import { requireAdminApi } from '../../../lib/requireAdminApi';

export const prerender = false;

function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
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

  if (file.size > MAX_QUESTION_IMAGE_SIZE_BYTES) {
    return json('Image must be 5 MB or smaller.', 400);
  }

  if (!allowedQuestionImageMimeTypes.has(file.type)) {
    return json('Only JPG, PNG, WEBP, and GIF images are supported.', 400);
  }

  const safeFileName = sanitizeQuestionImageFileName(file.name || 'question-image');
  const objectPath = `tests/${testId}/${Date.now()}-${safeFileName}`;
  const { supabase, error: bucketError } = await ensureQuestionImageBucketExists();

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
