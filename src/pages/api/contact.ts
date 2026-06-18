import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

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

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!isAllowedOrigin(request)) {
    return json(403, { error: 'Forbidden.' });
  }

  let name: string, contact: string, message: string;
  try {
    const fd = await request.formData();
    name    = fd.get('name')?.toString().trim()    ?? '';
    contact = fd.get('contact')?.toString().trim() ?? '';
    message = fd.get('message')?.toString().trim() ?? '';
  } catch {
    return json(400, { error: 'Neplatný požadavek.' });
  }

  if (!name || !contact || !message) {
    return json(400, { error: 'Vyplňte prosím všechna pole.' });
  }

  if (name.length > 100 || contact.length > 200 || message.length > 5000) {
    return json(400, { error: 'Zpráva je příliš dlouhá.' });
  }

  const apiKey  = import.meta.env.RESEND_API_KEY;
  const toEmail = import.meta.env.CONTACT_EMAIL ?? 'info@goldenpurple.cz';

  if (!apiKey) {
    return json(500, { error: 'Konfigurace serveru chybí.' });
  }

  const resend = new Resend(apiKey);
  const isEmail = contact.includes('@');

  // Strip newlines from subject to prevent header injection
  const safeNameForSubject = name.replace(/[\r\n]/g, ' ').slice(0, 80);

  const { error } = await resend.emails.send({
    from: 'Golden Purple <onboarding@resend.dev>',
    to: toEmail,
    ...(isEmail ? { replyTo: contact } : {}),
    subject: `Nová poptávka od ${safeNameForSubject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0C0610;margin-bottom:24px">Nová zpráva z webu</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 0;color:#666;width:120px">Jméno</td><td style="padding:10px 0;font-weight:600">${escHtml(name)}</td></tr>
          <tr><td style="padding:10px 0;color:#666">Kontakt</td><td style="padding:10px 0;font-weight:600">${escHtml(contact)}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#333;line-height:1.7;white-space:pre-wrap">${escHtml(message)}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#999;font-size:12px">Odesláno z goldenpurple.cz</p>
      </div>
    `,
  });

  if (error) {
    return json(500, { error: 'Nepodařilo se odeslat. Zkuste to prosím znovu.' });
  }

  return json(200, { ok: true });
};
