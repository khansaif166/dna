function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  factory: () => Promise<T>,
  label: string,
  attempts = 2,
  delayMs = 150
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        break;
      }

      console.warn(`[retry] ${label} failed on attempt ${attempt}/${attempts}`, {
        message: error instanceof Error ? error.message : String(error),
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}
