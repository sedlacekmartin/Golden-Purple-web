import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

const BASE = 'https://goldenpurple.cz';

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
        <a href="${BASE}/#p7" style="display:inline-block;background:#F5BD02;color:#0C0610;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:100px;font-size:15px;margin-bottom:18px">Domluvit konzultaci zdarma</a>
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
      ${extra ? `<span style="color:#A99CAE;font-size:12px;margin-left:6px">${extra}</span>` : ''}
    </td>
  </tr>`;
}

function buildScanHtml(d: Record<string, unknown>) {
  const scores = d.scores as Record<string, number> | undefined;
  const obs = d.observatory as { score: number; grade: string } | null | undefined;
  const green = d.green as { score: number; green: boolean } | null | undefined;
  const url = d.url as string;

  const body = `
    <p style="color:#A99CAE;font-size:13px;margin:0 0 20px;word-break:break-all">Výsledek pro: <b style="color:#F7F7F7">${url}</b></p>
    <table style="width:100%;border-collapse:collapse;background:rgba(247,247,247,.03);border:1px solid rgba(247,247,247,.08);border-radius:12px;margin-bottom:24px">
      <thead><tr><th colspan="2" style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5BD02;font-weight:600">Skóre</th></tr></thead>
      <tbody style="display:block;padding:0 16px">
        ${scores?.performance != null ? scoreBar('⚡ Rychlost', scores.performance) : ''}
        ${scores?.seo != null ? scoreBar('🔍 SEO', scores.seo) : ''}
        ${scores?.accessibility != null ? scoreBar('♿ Přístupnost', scores.accessibility) : ''}
        ${scores?.bestPractices != null ? scoreBar('🛡️ Kód & postupy', scores.bestPractices) : ''}
        ${obs ? scoreBar('🔒 HTTP hlavičky', obs.score, obs.grade) : ''}
        ${green ? `<tr><td style="padding:10px 0;color:#A99CAE;font-size:14px">🌱 Ekologie</td><td style="padding:10px 0;text-align:right;font-size:14px;color:${green.green ? '#2FA968' : '#A99CAE'}">${green.green ? 'Zelený hosting ✓' : 'Konvenční hosting'}</td></tr>` : ''}
      </tbody>
    </table>
    <p style="color:#D7CEDB;font-size:14px;line-height:1.6;margin:0">Chcete vědět, co přesně zlepšit a v jakém pořadí? Domluvte si s námi nezávaznou konzultaci — konkrétní kroky pro váš web připravíme zdarma.</p>`;

  return wrap(body);
}

function buildBrandHtml(d: Record<string, unknown>) {
  const score = d.score as number;
  const total = d.total as number;
  const verdict = d.verdict as string;
  const verdictText = d.verdictText as string;
  const breakdown = d.breakdown as { name: string; done: number; total: number }[];

  const pct = Math.round(score / total * 100);
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
          <td style="padding:11px 16px"><div style="background:rgba(247,247,247,.1);border-radius:100px;height:5px"><div style="background:#F5BD02;height:100%;width:${Math.round(b.done/b.total*100)}%;border-radius:100px"></div></div></td>
          <td style="padding:11px 16px;text-align:right;color:#A99CAE;font-size:13px;white-space:nowrap">${b.done}/${b.total}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="color:#D7CEDB;font-size:14px;line-height:1.6;margin:0">Chcete vědět, který pilíř posílit jako první? Uděláme brand analýzu přímo pro váš byznys — zdarma a nezávazně.</p>`;

  return wrap(body);
}

function buildRestaurantHtml(d: Record<string, unknown>) {
  const score = d.score as number;
  const total = d.total as number;
  const verdict = d.verdict as string;
  const verdictText = d.verdictText as string;
  const missing = d.missing as string[];

  const pct = Math.round(score / total * 100);
  const col = pct >= 80 ? '#2FA968' : pct >= 50 ? '#F5BD02' : '#D64545';

  const body = `
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:68px;font-weight:700;color:${col};line-height:1">${score}</span>
      <span style="font-size:24px;color:#A99CAE">/${total}</span>
      <div style="margin-top:8px;font-size:17px;font-weight:600;color:#F7F7F7">${verdict}</div>
      ${verdictText ? `<p style="color:#D7CEDB;font-size:14px;margin:10px 0 0;line-height:1.6">${verdictText}</p>` : ''}
    </div>
    ${missing && missing.length > 0 ? `
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
  scan: 'Výsledky vašeho web scanu — Golden Purple',
  brand: 'Výsledky Brand Scorecard — Golden Purple',
  restaurant: 'Výsledky testu webu restaurace — Golden Purple',
};

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Neplatný požadavek.' });
  }

  const { type, email, ...data } = body as { type: string; email: string } & Record<string, unknown>;

  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
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
    subject: `Nový lead [${type}] — ${email}`,
    html: `<p style="font-family:sans-serif">Nový lead z nástroje <b>${type}</b><br>Email: <b>${email}</b></p><pre style="font-family:monospace;font-size:12px;background:#f5f5f5;padding:16px;border-radius:8px">${JSON.stringify(data, null, 2)}</pre>`,
  }).catch(() => {});

  return json(200, { ok: true });
};
