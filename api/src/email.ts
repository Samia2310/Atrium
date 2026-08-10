import nodemailer from 'nodemailer';

type SentEmail = { to: string; subject: string; delivered: boolean; error?: string };

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

let cachedTransport: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (cachedTransport) return cachedTransport;

  const port = Number(env('SMTP_PORT', '587'));
  cachedTransport = nodemailer.createTransport({
    host: env('SMTP_HOST', 'localhost'),
    port,
    // Port 465 is implicit TLS; anything else (587, 25) negotiates
    // STARTTLS after connecting in plaintext. nodemailer picks the
    // right handshake automatically from this flag.
    secure: port === 465,
    auth: env('SMTP_USER')
      ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') }
      : undefined
  });
  return cachedTransport;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SentEmail> {
  if (!to) return { to, subject, delivered: false, error: 'missing recipient' };

  // Local dev convenience: log instead of sending, no SMTP server needed at all.
  if (env('MAIL_TRANSPORT', 'smtp') === 'console') {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
    return { to, subject, delivered: true };
  }

  try {
    await transport().sendMail({
      from: env('MAIL_FROM', 'no-reply@atrium.local'),
      to,
      subject,
      text
    });
    return { to, subject, delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email] delivery failed to ${to}: ${message}`);
    return { to, subject, delivered: false, error: message };
  }
}