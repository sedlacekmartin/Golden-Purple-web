import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALLOWED_ORIGINS = new Set([
  'https://goldenpurple.cz',
  'https://www.goldenpurple.cz',
]);

/**
 * Kontrola Origin hlavičky. Localhost povolen POUZE v dev režimu a jen jako
 * skutečný hostname — `startsWith('http://localhost')` dřív pouštěl i domény
 * typu http://localhost.utocnik.cz.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (import.meta.env.DEV) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    } catch { /* nevalidní origin → false */ }
  }
  return false;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': isAllowedOrigin(req) ? origin : 'https://goldenpurple.cz',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

// ── Podepsané tokeny pro /api/send-results ──
// Scan vygeneruje krátkodobý HMAC token; odeslání výsledků e-mailem ho vyžaduje.
// Bez něj byl endpoint otevřená e-mailová brána (spam z naší domény).

function tokenSecret(): string {
  // Dedikovaný secret má přednost; fallback na RESEND_API_KEY = funguje bez nové env proměnné
  return import.meta.env.RESULTS_TOKEN_SECRET ?? import.meta.env.RESEND_API_KEY ?? '';
}

const TOKEN_TTL_MS = 15 * 60_000;

export function createEmailToken(): string | null {
  const secret = tokenSecret();
  if (!secret) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = randomBytes(8).toString('hex');
  const sig = createHmac('sha256', secret).update(`${exp}.${nonce}`).digest('hex');
  return `${exp}.${nonce}.${sig}`;
}

/** Vrací podpis tokenu (pro single-use klíč v Redis), nebo null když je token neplatný. */
export function verifyEmailToken(token: unknown): string | null {
  const secret = tokenSecret();
  if (!secret) return 'no-secret'; // lokální dev bez env — nevynucujeme
  if (typeof token !== 'string') return null;
  const [expStr, nonce, sig] = token.split('.');
  if (!expStr || !nonce || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = createHmac('sha256', secret).update(`${expStr}.${nonce}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return sig;
}
