import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

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

  const apiKey  = import.meta.env.RESEND_API_KEY;
  const toEmail = import.meta.env.CONTACT_EMAIL ?? 'info@goldenpurple.cz';

  if (!apiKey) {
    return json(500, { error: 'Konfigurace serveru chybí.' });
  }

  const resend = new Resend(apiKey);
  const isEmail = contact.includes('@');

  const { error } = await resend.emails.send({
    from: 'Golden Purple <onboarding@resend.dev>',
    to: toEmail,
    ...(isEmail ? { replyTo: contact } : {}),
    subject: `Nová poptávka od ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0C0610;margin-bottom:24px">Nová zpráva z webu</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 0;color:#666;width:120px">Jméno</td><td style="padding:10px 0;font-weight:600">${name}</td></tr>
          <tr><td style="padding:10px 0;color:#666">Kontakt</td><td style="padding:10px 0;font-weight:600">${contact}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#333;line-height:1.7;white-space:pre-wrap">${message}</p>
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
