export const prerender = false;

export async function GET({ request }) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  const strategy = url.searchParams.get('strategy') || 'mobile';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

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

  const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  apiUrl.searchParams.set('url', targetUrl);
  apiUrl.searchParams.set('strategy', strategy);
  apiUrl.searchParams.set('key', KEY);
  ['performance', 'seo', 'accessibility', 'best-practices'].forEach(c =>
    apiUrl.searchParams.append('category', c)
  );

  try {
    const r = await fetch(apiUrl.toString());
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: 'Web se nepodařilo načíst. Zkontrolujte URL nebo zkuste později.',
          detail: e?.error?.message || null,
        }),
        { status: 502, headers }
      );
    }
    const data = await r.json();
    const cats = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};

    const score = c => (cats[c]?.score != null ? Math.round(cats[c].score * 100) : null);
    const metric = id => audits[id]?.displayValue || null;

    return new Response(
      JSON.stringify({
        url: targetUrl,
        strategy,
        scores: {
          performance: score('performance'),
          seo: score('seo'),
          accessibility: score('accessibility'),
          bestPractices: score('best-practices'),
        },
        details: {
          loadTime: metric('largest-contentful-paint'),
          interactive: metric('interactive'),
          speedIndex: metric('speed-index'),
          httpsOk: audits['is-on-https']?.score === 1,
          viewportOk: audits['viewport']?.score === 1,
          metaDescription: audits['meta-description']?.score === 1,
          imageAlt: audits['image-alt']?.score === 1,
        },
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Něco se pokazilo při skenování.', detail: String(err) }),
      { status: 500, headers }
    );
  }
}
