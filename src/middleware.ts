import type { MiddlewareHandler } from 'astro';

import { authMiddleware } from './lib/auth-middleware';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const routeLimits = new Map<string, number>([
  ['/api/auth/login', 10],
  ['/api/auth/signup', 5],
  ['/api/attempts/submit', 5],
]);

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

export const onRequest: MiddlewareHandler = (context, next) => {
  const pathname = context.url.pathname;
  const ip = context.request.headers.get('cf-connecting-ip');
  const limitedResponse = checkRateLimit(pathname, ip);

  if (limitedResponse) {
    return limitedResponse;
  }

  return authMiddleware(context, next);
};
