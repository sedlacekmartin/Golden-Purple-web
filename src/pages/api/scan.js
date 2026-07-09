export const prerender = false;

import { corsHeaders, createEmailToken } from '../../lib/security';
import { Resend } from 'resend';

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET({ request }) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  const strategy = url.searchParams.get('strategy') || 'mobile';

  const headers = corsHeaders(request);

  if (!targetUrl || !/^https?:\/\/.+\..+/.test(targetUrl)) {
    return new Response(
      JSON.stringify({ error: 'Zadejte platnou URL včetně https://' }),
      { status: 400, headers }
    );
  }

  const KEY = import.meta.env.PAGESPEED_API_KEY;
  if (!KEY) {
    return new Response(
      JSON.stringify({ error: 'Chybí API klíč na serveru. Nastav PAGESPEED_API_KEY v Environment Variables.' }),
      { status: 500, headers }
    );
  }

  let hostname;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    // regex propustí např. "https://a b.com" — konstruktor URL ne
    return new Response(
      JSON.stringify({ error: 'Zadejte platnou URL včetně https://' }),
      { status: 400, headers }
    );
  }

  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

  async function fetchPageSpeed() {
    const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    apiUrl.searchParams.set('url', targetUrl);
    apiUrl.searchParams.set('strategy', strategy);
    apiUrl.searchParams.set('key', KEY);
    ['performance', 'seo', 'accessibility', 'best-practices'].forEach(c =>
      apiUrl.searchParams.append('category', c)
    );
    const r = await fetch(apiUrl.toString());
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e?.error?.message || 'PageSpeed failed');
    }
    const data = await r.json();
    const cats = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};
    return {
      scores: {
        performance: cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null,
        seo: cats.seo?.score != null ? Math.round(cats.seo.score * 100) : null,
        accessibility: cats.accessibility?.score != null ? Math.round(cats.accessibility.score * 100) : null,
        bestPractices: cats['best-practices']?.score != null ? Math.round(cats['best-practices'].score * 100) : null,
      },
      details: {
        loadTime: audits['largest-contentful-paint']?.displayValue || null,
        interactive: audits['interactive']?.displayValue || null,
        speedIndex: audits['speed-index']?.displayValue || null,
        httpsOk: audits['is-on-https']?.score === 1,
        viewportOk: audits['viewport']?.score === 1,
        metaDescription: audits['meta-description']?.score === 1,
        imageAlt: audits['image-alt']?.score === 1,
      },
    };
  }

  async function fetchObservatory() {
    // Nové Observatory API (MDN, 2024) — synchronní GET, žádné polling
    const res = await fetch(
      `https://observatory-api.mdn.mozilla.net/api/v2/analyze?host=${hostname}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const grade = data.grade ?? data.scan?.grade ?? null;
    const score = data.score ?? data.scan?.score ?? null;
    if (grade == null || score == null) return null;
    return { grade, score };
  }

  async function fetchGreenCheck() {
    const res = await fetch(
      `https://api.thegreenwebfoundation.org/api/v3/greencheck/${hostname}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) throw new Error(`GreenCheck HTTP ${res.status}`);
    const data = await res.json();
    const green = data.green === true;
    return {
      green,
      hostedBy: data.hosted_by || null,
      score: green ? 100 : 20,
    };
  }

  try {
    // Všechno paralelně — celkový čas = max ze tří, ne součet
    const [psResult, obsResult, greenResult] = await Promise.allSettled([
      withTimeout(fetchPageSpeed(), 28000),
      withTimeout(fetchObservatory(), 22000),
      withTimeout(fetchGreenCheck(), 8000),
    ]);

    if (psResult.status === 'rejected') {
      return new Response(
        JSON.stringify({
          error: 'Web se nepodařilo načíst. Zkontrolujte URL nebo zkuste později.',
          detail: String(psResult.reason),
        }),
        { status: 502, headers }
      );
    }

    const ps = psResult.value;
    const obs = obsResult.status === 'fulfilled' ? obsResult.value : null;
    const green = greenResult.status === 'fulfilled' ? greenResult.value : null;

    // Notifikace o každém spuštěném scanu, i bez zanechaného kontaktu — ať je
    // vidět, jaké firmy/weby si lidé prohlížejí, dřív než se případně ozvou.
    // Musí se čekat (await) — na serverless by nedočkaný fetch mohl zmizet
    // dřív, než se stihne odeslat po síti (viz stejný bug u send-results).
    const apiKey = import.meta.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        const fromEmail = import.meta.env.RESEND_FROM ?? 'Golden Purple <onboarding@resend.dev>';
        const notifyEmail = import.meta.env.CONTACT_EMAIL ?? 'info@goldenpurple.cz';
        const zdroj = url.searchParams.get('utm_source');
        // Vercel edge geolokace — zdarma, vestavěné, žádná externí služba (přibližná, dle IP bloku)
        const geoCity = request.headers.get('x-vercel-ip-city');
        const geoCountry = request.headers.get('x-vercel-ip-country');
        const geo = [geoCity ? decodeURIComponent(geoCity) : null, geoCountry].filter(Boolean).join(', ');
        await resend.emails.send({
          from: fromEmail,
          to: notifyEmail,
          subject: `Nový scan → ${hostname}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px">
              <h2 style="margin:0 0 14px">Nový scan spuštěn</h2>
              <p style="margin:0 0 6px"><b>URL:</b> <a href="${escHtml(targetUrl)}">${escHtml(targetUrl)}</a></p>
              ${zdroj ? `<p style="margin:0 0 6px"><b>Zdroj:</b> ${escHtml(zdroj)}</p>` : ''}
              ${geo ? `<p style="margin:0 0 6px"><b>Přibližná poloha:</b> ${escHtml(geo)}</p>` : ''}
              <p style="margin:14px 0 6px"><b>Skóre:</b></p>
              <ul style="margin:0 0 14px;padding-left:20px">
                <li>Rychlost: ${ps.scores.performance ?? '–'}</li>
                <li>SEO: ${ps.scores.seo ?? '–'}</li>
                <li>Přístupnost: ${ps.scores.accessibility ?? '–'}</li>
                <li>Kód &amp; postupy: ${ps.scores.bestPractices ?? '–'}</li>
                ${obs ? `<li>HTTP hlavičky: ${obs.score} (${escHtml(obs.grade)})</li>` : ''}
                ${green ? `<li>Ekologie: ${green.green ? 'zelený hosting' : 'konvenční hosting'}</li>` : ''}
              </ul>
              <p style="color:#999;font-size:12px">Zatím bez kontaktu — jen informace, že si někdo prohlíží tenhle web.</p>
            </div>
          `,
        });
      } catch (e) {
        console.error('[scan] Notifikace o scanu selhala:', e);
      }
    }

    return new Response(
      JSON.stringify({
        url: targetUrl,
        strategy,
        scores: ps.scores,
        details: ps.details,
        observatory: obs,
        green,
        // krátkodobý podepsaný token — /api/send-results ho vyžaduje (anti-spam)
        emailToken: createEmailToken(),
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Web se nepodařilo načíst. Zkontrolujte URL nebo zkuste později.',
        detail: String(err),
      }),
      { status: 502, headers }
    );
  }
}
