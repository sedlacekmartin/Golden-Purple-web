import { defineMiddleware } from 'astro:middleware';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://newassets.hcaptcha.com https://www.clarity.ms https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://newassets.hcaptcha.com https://api.fontshare.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://newassets.hcaptcha.com",
  "font-src 'self' data: https://api.fontshare.com https://cdn.fontshare.com",
  "connect-src 'self' https://api.hcaptcha.com https://newassets.hcaptcha.com https://b.clarity.ms https://api.fontshare.com",
  "frame-src https://newassets.hcaptcha.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

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
  const url  = new URL(request.url);
  const path = url.pathname;

  // Rate limiting — POST API routes + GET /api/scan
  if (limiters && (request.method === 'POST' || (request.method === 'GET' && path === '/api/scan'))) {
    const path = new URL(request.url).pathname;
    const limiter = limiters[path as keyof typeof limiters];

    if (limiter) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
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
      return addSecurityHeaders(response);
    }
  }

  const response = await next();
  return addSecurityHeaders(response);
});

function addSecurityHeaders(response: Response): Response {
  const h = response.headers;
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Content-Security-Policy', CSP);
  return response;
}
