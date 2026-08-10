import nodemailer, { Transporter } from 'nodemailer';

export type SentEmail = {
  to: string;
  subject: string;
  delivered: boolean;
  error?: string;
};

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

let cachedTransport: Transporter | null = null;

function transport(): Transporter {
  if (cachedTransport) return cachedTransport;

  const port = Number(env('SMTP_PORT', '1025'));
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');

  cachedTransport = nodemailer.createTransport({
    host: env('SMTP_HOST', 'localhost'),
    port,
    secure: port === 465,
    auth: user && pass
      ? {
          user,
          pass
        }
      : undefined
  });

  return cachedTransport;
}

async function sendViaResend(
  to: string,
  subject: string,
  text: string
): Promise<SentEmail> {
  const apiKey = env('RESEND_API_KEY');

  if (!apiKey) {
    return {
      to,
      subject,
      delivered: false,
      error: 'RESEND_API_KEY is not configured'
    };
  }

  const from = env('MAIL_FROM');

  if (!from) {
    return {
      to,
      subject,
      delivered: false,
      error: 'MAIL_FROM is not configured'
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text
      })
    });

    if (!response.ok) {
      const body = await response.text();

      return {
        to,
        subject,
        delivered: false,
        error: `Resend ${response.status}: ${body}`
      };
    }

    return {
      to,
      subject,
      delivered: true
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      to,
      subject,
      delivered: false,
      error: message
    };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<SentEmail> {
  if (!to) {
    return {
      to,
      subject,
      delivered: false,
      error: 'missing recipient'
    };
  }

  const mailTransport = env('MAIL_TRANSPORT', 'smtp');

  // Local development
  if (mailTransport === 'console') {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);

    return {
      to,
      subject,
      delivered: true
    };
  }

  // Production
  if (mailTransport === 'resend') {
    return sendViaResend(to, subject, text);
  }

  // SMTP fallback for local/other environments
  try {
    await transport().sendMail({
      from: env('MAIL_FROM', 'no-reply@atrium.local'),
      to,
      subject,
      text
    });

    return {
      to,
      subject,
      delivered: true
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.warn(`[email] delivery failed to ${to}: ${message}`);

    return {
      to,
      subject,
      delivered: false,
      error: message
    };
  }
}
