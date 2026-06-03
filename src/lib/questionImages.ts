import { getAdminSupabase } from './supabase';

export const QUESTION_IMAGE_BUCKET = import.meta.env.SUPABASE_QUESTION_IMAGE_BUCKET || 'question-images';
export const MAX_QUESTION_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const allowedQuestionImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function sanitizeQuestionImageFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function ensureQuestionImageBucketExists() {
  const supabase = getAdminSupabase();
  const { data: existingBucket, error: getBucketError } = await supabase.storage.getBucket(QUESTION_IMAGE_BUCKET);

  if (existingBucket) {
    return { supabase, error: null as string | null };
  }

  const { error: createBucketError } = await supabase.storage.createBucket(QUESTION_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_QUESTION_IMAGE_SIZE_BYTES}`,
    allowedMimeTypes: [...allowedQuestionImageMimeTypes],
  });

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    return {
      supabase,
      error: createBucketError.message || getBucketError?.message || 'Failed to initialize the image storage bucket.',
    };
  }

  return { supabase, error: null as string | null };
}
