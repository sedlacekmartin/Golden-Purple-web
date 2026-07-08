import { defineMiddleware } from 'astro:middleware';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Security headers (CSP, HSTS, …) jsou ve vercel.json — statické (prerendered)
// stránky middleware neprocházejí, hlavičky proto nastavuje Vercel edge pro vše.
// Middleware řeší jen rate limiting API routes.

// Redis is optional — skipped in dev if env vars aren't set
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;

const limiters = redis
  ? {
      '/api/contact':      new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5,  '1 m'), prefix: 'rl:contact' }),
      '/api/send-results': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:results' }),
      '/api/scan':         new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(6,  '1 m'), prefix: 'rl:scan' }),
    }
  : null;

export const onRequest = defineMiddleware(async ({ request }, next) => {
  // Rate limiting — POST API routes + GET /api/scan
  if (limiters && (request.method === 'POST' || (request.method === 'GET' && new URL(request.url).pathname === '/api/scan'))) {
    const path = new URL(request.url).pathname;
    const limiter = limiters[path as keyof typeof limiters];

    if (limiter) {
      // x-real-ip nastavuje Vercel proxy (nepodvrhnutelné); první hodnota
      // x-forwarded-for je klientem spoofovatelná, proto jen jako fallback poslední
      const ip = request.headers.get('x-real-ip')
        ?? request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
        ?? 'anonymous';
      const { success, limit, remaining, reset } = await limiter.limit(ip);

      if (!success) {
        return new Response(
          JSON.stringify({ error: 'Příliš mnoho požadavků. Zkuste to za chvíli.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }

      const response = await next();
      response.headers.set('X-RateLimit-Limit', String(limit));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      return response;
    }
  }

  return next();
});
