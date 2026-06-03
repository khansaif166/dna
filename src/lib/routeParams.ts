import { z } from 'zod';

const uuidSchema = z.string().uuid();

export function getUuidParam(
  value: string | undefined,
  options?: {
    response?: Response;
  }
) {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : options?.response ?? new Response(null, { status: 404 });
}
