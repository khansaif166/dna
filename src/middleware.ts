import type { MiddlewareHandler } from 'astro';

import { authMiddleware } from './lib/auth-middleware';
import { setRuntimeEnv } from './lib/serverEnv';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const routeLimits = new Map<string, number>([
  ['/api/auth/login', 10],
  ['/api/auth/signup', 5],
  ['/api/attempts/submit', 5],
]);

function syncRuntimeEnvToProcessEnv(runtimeEnv: Record<string, unknown> | undefined) {
  if (!runtimeEnv) {
    return;
  }

  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === 'string' && process.env[key] !== value) {
      process.env[key] = value;
    }
  }
}

function checkRateLimit(pathname: string, ip: string | null) {
  const limit = routeLimits.get(pathname);

  if (!limit || !ip) {
    return null;
  }

  const key = `${pathname}:${ip}`;
  const now = Date.now();
  const current = rateLimits.get(key);

  if (!current || now > current.resetAt) {
    rateLimits.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }

  if (current.count >= limit) {
    return new Response('Too many requests', { status: 429 });
  }

  current.count += 1;
  rateLimits.set(key, current);
  return null;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  try {
    setRuntimeEnv(
      context.locals.runtime?.env as Record<string, unknown> | undefined
    );

    syncRuntimeEnvToProcessEnv(
      context.locals.runtime?.env as Record<string, unknown> | undefined
    );

    const pathname = context.url.pathname;
    const ip = context.request.headers.get('cf-connecting-ip');
    const limitedResponse = checkRateLimit(pathname, ip);

    if (limitedResponse) {
      return limitedResponse;
    }

    return await authMiddleware(context, next);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown middleware error';
    const stack = error instanceof Error ? error.stack ?? '' : '';

    if (context.url.pathname === '/api/auth/login' || context.url.pathname === '/api/debug/env') {
      return new Response(`Middleware failure: ${message}\n\n${stack}`, {
        status: 500,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    return new Response('Internal Server Error', { status: 500 });
  }
};
