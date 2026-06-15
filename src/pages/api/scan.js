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

  const hostname = new URL(targetUrl).hostname;

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
    const initRes = await fetch(
      `https://http-observatory.security.mozilla.org/api/v1/analyze?host=${hostname}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hidden=true' }
    );
    let data = await initRes.json();
    if (!data.state) return null;
    if (data.state === 'FINISHED') return { grade: data.grade, score: data.score };
    // Poll up to 3× with 4s delay
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const res = await fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${hostname}`);
      data = await res.json();
      if (data.state === 'FINISHED') return { grade: data.grade, score: data.score };
      if (data.state === 'FAILED' || data.state === 'ABORTED') return null;
    }
    return null;
  }

  async function fetchCarbon() {
    const res = await fetch(`https://api.websitecarbon.com/site?url=${encodeURIComponent(targetUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const co2 = data.statistics?.co2?.grid?.grams;
    const cleanerThan = typeof data.cleanerThan === 'number' ? data.cleanerThan : null;
    return {
      score: cleanerThan != null ? Math.round(cleanerThan * 100) : null,
      co2: co2 != null ? parseFloat(co2.toFixed(3)) : null,
    };
  }

  try {
    const [psResult, obsResult, carbonResult] = await Promise.allSettled([
      withTimeout(fetchPageSpeed(), 30000),
      withTimeout(fetchObservatory(), 18000),
      withTimeout(fetchCarbon(), 10000),
    ]);

    if (psResult.status === 'rejected') {
      return new Response(
        JSON.stringify({
          error: 'Web se nepodařilo načíst. Zkontrolujte URL nebo zkuste později.',
          detail: psResult.reason?.message || null,
        }),
        { status: 502, headers }
      );
    }

    const ps = psResult.value;

    return new Response(
      JSON.stringify({
        url: targetUrl,
        strategy,
        scores: ps.scores,
        details: ps.details,
        observatory: obsResult.status === 'fulfilled' ? obsResult.value : null,
        carbon: carbonResult.status === 'fulfilled' ? carbonResult.value : null,
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
