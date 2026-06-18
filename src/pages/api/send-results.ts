import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

const BASE = 'https://goldenpurple.cz';

const ALLOWED_ORIGINS = new Set([
  'https://goldenpurple.cz',
  'https://www.goldenpurple.cz',
]);

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  return false;
}

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, Math.min(n, 10000)) : 0;
}

function scoreColor(v: number) {
  return v >= 90 ? '#2FA968' : v >= 50 ? '#F5BD02' : '#D64545';
}

function wrap(body: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#080410;font-family:sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#0C0610;border:1px solid rgba(247,247,247,.1);border-radius:18px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#56215E,#3B1243);padding:28px 32px;text-align:center">
        <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(247,247,247,.5);margin-bottom:8px">Golden Purple</div>
        <div style="font-size:22px;font-weight:700;color:#F7F7F7">Vaše výsledky</div>
      </div>
      <div style="padding:28px 32px">${body}</div>
      <div style="padding:20px 32px;border-top:1px solid rgba(247,247,247,.08);text-align:center">
        <a href="${BASE}/#kontakt" style="display:inline-block;background:#F5BD02;color:#0C0610;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:100px;font-size:15px;margin-bottom:18px">Domluvit konzultaci zdarma</a>
        <div style="font-size:12px;color:#5a5060">Golden Purple · <a href="${BASE}" style="color:#F5BD02;text-decoration:none">goldenpurple.cz</a></div>
      </div>
    </div>
  </body></html>`;
}

function scoreBar(label: string, value: number, extra = '') {
  const col = scoreColor(value);
  return `<tr>
    <td style="padding:10px 0;color:#A99CAE;font-size:14px;vertical-align:middle">${label}</td>
    <td style="padding:10px 0;text-align:right;vertical-align:middle">
      <span style="font-size:22px;font-weight:700;color:${col}">${value}</span><span style="color:#5a5060;font-size:13px">/100</span>
      ${extra ? `<span style="color:#A99CAE;font-size:12px;margin-left:6px">${escHtml(extra)}</span>` : ''}
    </td>
  </tr>`;
}

function buildScanRecommendations(
  scores: Record<string, number> | undefined,
  obs: { score: number; grade: string } | null | undefined,
  green: { score: number; green: boolean } | null | undefined
): string {
  const tips: { label: string; text: string; priority: number }[] = [];

  if (scores?.performance != null) {
    if (scores.performance < 50) {
      tips.push({
        label: '⚡ Rychlost — kritická',
        text: 'Web se načítá příliš pomalu. Největší vliv mívají neoptimalizované obrázky (použijte WebP/AVIF), zbytečný JavaScript a absence CDN. Každá vteřina zpoždění snižuje konverze průměrně o 7 %.',
        priority: 1,
      });
    } else if (scores.performance < 75) {
      tips.push({
        label: '⚡ Rychlost — má rezervy',
        text: 'Rychlost je průměrná. Zkontrolujte Core Web Vitals — zejména LCP (nejpomalejší načtený prvek stránky) a CLS (přeskakování layoutu při načítání). Google to od roku 2021 bere jako přímý rankingový faktor.',
        priority: 2,
      });
    }
  }

  if (scores?.seo != null) {
    if (scores.seo < 60) {
      tips.push({
        label: '🔍 SEO — základ chybí',
        text: 'Google nemá dost informací pro správné zařazení webu. Nejčastější příčiny: chybí meta popis, špatná struktura nadpisů (H1, H2) nebo obrázky bez alt textu. Jsou to nejrychlejší opravy s největším dopadem.',
        priority: 1,
      });
    } else if (scores.seo < 85) {
      tips.push({
        label: '🔍 SEO — drobné mezery',
        text: 'Základ SEO máte, ale jsou tu mezery. Projděte meta popisky na klíčových stránkách — měly by být unikátní a obsahovat hlavní klíčové slovo. Zkontrolujte také správné nastavení kanoických URL.',
        priority: 3,
      });
    }
  }

  if (scores?.accessibility != null && scores.accessibility < 70) {
    tips.push({
      label: '♿ Přístupnost',
      text: scores.accessibility < 50
        ? 'Nízká přístupnost zahrnuje problémy, které trápí i běžné uživatele: nízký kontrast textu, chybějící popisky tlačítek nebo formulářů. Od 28. června 2025 platí European Accessibility Act — pro weby firem v EU je přístupnost povinná.'
        : 'Přístupnost má mezery. Nejčastěji jde o nízký kontrast textu (viditelný hlavně na mobilu na přímém slunci) nebo chybějící ARIA popisky pro screenreadery.',
      priority: scores.accessibility < 50 ? 1 : 2,
    });
  }

  if (scores?.bestPractices != null && scores.bestPractices < 70) {
    tips.push({
      label: '🛡️ Kód & postupy',
      text: 'Web používá zastaralé technologie nebo chybí základní bezpečnostní nastavení. Nejčastěji jde o zastaralé JS knihovny se známými zranitelnostmi nebo chybějící přesměrování HTTP → HTTPS.',
      priority: 2,
    });
  }

  if (obs != null && obs.score < 50) {
    tips.push({
      label: `🔒 HTTP hlavičky — hodnocení ${escHtml(obs.grade)}`,
      text: 'Bezpečnostní HTTP hlavičky chybí nebo jsou špatně nastaveny. Web je tak zranitelnější vůči clickjackingu a vložení cizího kódu. Řeší se nastavením na serveru nebo v .htaccess — obvykle jde o záležitost pár minut pro admina.',
      priority: 2,
    });
  }

  if (green != null && !green.green) {
    tips.push({
      label: '🌱 Hosting na fosilních palivech',
      text: 'Váš hosting neběží na obnovitelné energii. Přechod na zelený hosting je jeden z nejjednodušších ekologických kroků a stále víc zákazníků to vnímá jako plus při výběru dodavatele.',
      priority: 4,
    });
  }

  if (tips.length === 0) {
    return `
    <div style="background:rgba(47,169,104,.07);border:1px solid rgba(47,169,104,.25);border-radius:10px;padding:20px 22px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#2FA968;margin-bottom:8px">Web máte technicky v pořádku 👍</div>
      <div style="font-size:13px;color:#A99CAE;line-height:1.7">To je dobrý základ — ale technické skóre ještě neznamená, že web skutečně prodává. Trápí vás třeba to, jak web vypadá? Nebo jak působí váš brand jako celek? Ozvěte se nám — podíváme se na to spolu.</div>
    </div>`;
  }

  const top = tips.sort((a, b) => a.priority - b.priority).slice(0, 3);

  return `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5BD02;font-weight:600;margin-bottom:14px">Co řešit jako první</div>
      ${top.map(t => `
        <div style="background:rgba(247,247,247,.03);border:1px solid rgba(247,247,247,.08);border-radius:10px;padding:16px 18px;margin-bottom:10px">
          <div style="font-size:13px;font-weight:700;color:#F7F7F7;margin-bottom:6px">${t.label}</div>
          <div style="font-size:13px;color:#A99CAE;line-height:1.6">${t.text}</div>
        </div>
      `).join('')}
    </div>`;
}

function buildScanHtml(d: Record<string, unknown>) {
  const scores = d.scores as Record<string, number> | undefined;
  const obs = d.observatory as { score: number; grade: string } | null | undefined;
  const green = d.green as { score: number; green: boolean } | null | undefined;
  const url = escHtml(String(d.url ?? '').slice(0, 500));

  const recs = buildScanRecommendations(scores, obs, green);

  const body = `
    <p style="color:#A99CAE;font-size:13px;margin:0 0 20px;word-break:break-all">Výsledek pro: <b style="color:#F7F7F7">${url}</b></p>
    <table style="width:100%;border-collapse:collapse;background:rgba(247,247,247,.03);border:1px solid rgba(247,247,247,.08);border-radius:12px;margin-bottom:24px">
      <thead><tr><th colspan="2" style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5BD02;font-weight:600">Skóre</th></tr></thead>
      <tbody style="display:block;padding:0 16px">
        ${scores?.performance != null ? scoreBar('⚡ Rychlost', safeNum(scores.performance)) : ''}
        ${scores?.seo != null ? scoreBar('🔍 SEO', safeNum(scores.seo)) : ''}
        ${scores?.accessibility != null ? scoreBar('♿ Přístupnost', safeNum(scores.accessibility)) : ''}
        ${scores?.bestPractices != null ? scoreBar('🛡️ Kód & postupy', safeNum(scores.bestPractices)) : ''}
        ${obs ? scoreBar('🔒 HTTP hlavičky', safeNum(obs.score), obs.grade) : ''}
        ${green ? `<tr><td style="padding:10px 0;color:#A99CAE;font-size:14px">🌱 Ekologie</td><td style="padding:10px 0;text-align:right;font-size:14px;color:${green.green ? '#2FA968' : '#A99CAE'}">${green.green ? 'Zelený hosting ✓' : 'Konvenční hosting'}</td></tr>` : ''}
      </tbody>
    </table>
    ${recs}
    <p style="color:#D7CEDB;font-size:14px;line-height:1.6;margin:0">Chcete analýzu projít společně a naplánovat, co řešit v jakém pořadí? Konzultaci uděláme zdarma.</p>`;

  return wrap(body);
}

function buildBrandHtml(d: Record<string, unknown>) {
  const score = safeNum(d.score);
  const total = safeNum(d.total);
  const verdict = escHtml(String(d.verdict ?? '').slice(0, 120));
  const verdictText = escHtml(String(d.verdictText ?? '').slice(0, 600));
  const rawBreakdown = Array.isArray(d.breakdown) ? d.breakdown : [];
  const breakdown = rawBreakdown.map((b: unknown) => {
    const obj = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    return {
      name: escHtml(String(obj.name ?? '').slice(0, 60)),
      done: safeNum(obj.done),
      total: safeNum(obj.total) || 1,
    };
  });

  const pct = total > 0 ? Math.round(score / total * 100) : 0;
  const col = pct >= 80 ? '#2FA968' : pct >= 50 ? '#F5BD02' : '#D64545';

  const body = `
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:68px;font-weight:700;color:${col};line-height:1">${score}</span>
      <span style="font-size:24px;color:#A99CAE">/${total}</span>
      <div style="margin-top:8px;font-size:17px;font-weight:600;color:#F7F7F7">${verdict}</div>
      ${verdictText ? `<p style="color:#D7CEDB;font-size:14px;margin:10px 0 0;line-height:1.6">${verdictText}</p>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;background:rgba(247,247,247,.03);border:1px solid rgba(247,247,247,.08);border-radius:12px;margin-bottom:24px">
      <thead><tr><th colspan="3" style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5BD02;font-weight:600">Pilíře</th></tr></thead>
      <tbody>
        ${breakdown.map(b => `
        <tr style="border-top:1px solid rgba(247,247,247,.06)">
          <td style="padding:11px 16px;color:#D7CEDB;font-size:14px;width:120px">${b.name}</td>
          <td style="padding:11px 16px"><div style="background:rgba(247,247,247,.1);border-radius:100px;height:5px"><div style="background:#F5BD02;height:100%;width:${Math.round(b.done / b.total * 100)}%;border-radius:100px"></div></div></td>
          <td style="padding:11px 16px;text-align:right;color:#A99CAE;font-size:13px;white-space:nowrap">${b.done}/${b.total}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="color:#D7CEDB;font-size:14px;line-height:1.6;margin:0">Chcete vědět, který pilíř posílit jako první? Uděláme brand analýzu přímo pro váš byznys — zdarma a nezávazně.</p>`;

  return wrap(body);
}

function buildRestaurantHtml(d: Record<string, unknown>) {
  const score = safeNum(d.score);
  const total = safeNum(d.total);
  const verdict = escHtml(String(d.verdict ?? '').slice(0, 120));
  const verdictText = escHtml(String(d.verdictText ?? '').slice(0, 600));
  const missing = Array.isArray(d.missing)
    ? d.missing.slice(0, 50).map((m: unknown) => escHtml(String(m).slice(0, 200)))
    : [];

  const pct = total > 0 ? Math.round(score / total * 100) : 0;
  const col = pct >= 80 ? '#2FA968' : pct >= 50 ? '#F5BD02' : '#D64545';

  const body = `
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:68px;font-weight:700;color:${col};line-height:1">${score}</span>
      <span style="font-size:24px;color:#A99CAE">/${total}</span>
      <div style="margin-top:8px;font-size:17px;font-weight:600;color:#F7F7F7">${verdict}</div>
      ${verdictText ? `<p style="color:#D7CEDB;font-size:14px;margin:10px 0 0;line-height:1.6">${verdictText}</p>` : ''}
    </div>
    ${missing.length > 0 ? `
    <div style="background:rgba(247,247,247,.03);border:1px solid rgba(247,247,247,.08);border-radius:12px;margin-bottom:24px;overflow:hidden">
      <div style="padding:12px 16px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5BD02;font-weight:600">Co webu chybí (${missing.length} prvků)</div>
      ${missing.map(m => `<div style="padding:10px 16px;border-top:1px solid rgba(247,247,247,.06);font-size:13px;color:#A99CAE">✗ ${m}</div>`).join('')}
    </div>` : ''}
    <p style="color:#D7CEDB;font-size:14px;line-height:1.6;margin:0">Chcete vědět, které prvky doplnit jako první a jak? Připravíme plán na míru pro váš podnik — zdarma a nezávazně.</p>`;

  return wrap(body);
}

const builders: Record<string, (d: Record<string, unknown>) => string> = {
  scan: buildScanHtml,
  brand: buildBrandHtml,
  restaurant: buildRestaurantHtml,
};

const subjects: Record<string, string> = {
  scan: 'Výsledky scanu + co zlepšit jako první — Golden Purple',
  brand: 'Výsledky Brand Scorecard — Golden Purple',
  restaurant: 'Výsledky testu webu restaurace — Golden Purple',
};

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!isAllowedOrigin(request)) {
    return json(403, { error: 'Forbidden.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Neplatný požadavek.' });
  }

  const { type, email, ...data } = body as { type: string; email: string } & Record<string, unknown>;

  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return json(400, { error: 'Zadejte platný e-mail.' });
  }
  if (!builders[type]) {
    return json(400, { error: 'Neznámý typ výsledku.' });
  }

  const apiKey = import.meta.env.RESEND_API_KEY;
  const notifyEmail = import.meta.env.CONTACT_EMAIL ?? 'info@goldenpurple.cz';

  if (!apiKey) {
    return json(500, { error: 'Konfigurace serveru chybí.' });
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: 'Golden Purple <onboarding@resend.dev>',
    to: email,
    subject: subjects[type],
    html: builders[type](data),
  });

  if (error) {
    return json(500, { error: 'Nepodařilo se odeslat. Zkuste to prosím znovu.' });
  }

  // Lead notification — fire and forget
  resend.emails.send({
    from: 'Golden Purple <onboarding@resend.dev>',
    to: notifyEmail,
    subject: `Nový lead [${type}] — ${escHtml(email)}`,
    html: `<p style="font-family:sans-serif">Nový lead z nástroje <b>${escHtml(type)}</b><br>Email: <b>${escHtml(email)}</b></p><pre style="font-family:monospace;font-size:12px;background:#f5f5f5;padding:16px;border-radius:8px">${escHtml(JSON.stringify(data, null, 2))}</pre>`,
  }).catch(() => {});

  return json(200, { ok: true });
};
