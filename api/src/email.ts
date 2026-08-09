import net from 'node:net';

type SentEmail = { to: string; subject: string; delivered: boolean; error?: string };

const TIMEOUT_MS = 5000;

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function smtpLine(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

function dotEscape(value: string): string {
  return value.replace(/^\./gm, '..');
}

async function sendSmtp(to: string, subject: string, text: string): Promise<void> {
  const host = env('SMTP_HOST', 'localhost');
  const port = Number(env('SMTP_PORT', '1025'));
  const from = env('MAIL_FROM', 'no-reply@atrium.local');
  const socket = net.createConnection({ host, port });
  socket.setEncoding('utf8');
  socket.setTimeout(TIMEOUT_MS);

  let buffer = '';
  const readResponse = () => new Promise<string>((resolve, reject) => {
    const onData = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        socket.off('data', onData);
        const response = buffer;
        buffer = '';
        if (/^[245]\d\d /.test(last)) resolve(response);
        else reject(new Error(last));
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP timeout')));
  });

  const write = async (command: string) => {
    socket.write(command);
    await readResponse();
  };

  await readResponse();
  await write('HELO atrium.local\r\n');
  await write(`MAIL FROM:<${from}>\r\n`);
  await write(`RCPT TO:<${to}>\r\n`);
  await write('DATA\r\n');
  socket.write([
    `From: ${smtpLine(from)}`,
    `To: ${smtpLine(to)}`,
    `Subject: ${smtpLine(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    dotEscape(text),
    '.'
  ].join('\r\n') + '\r\n');
  await readResponse();
  socket.write('QUIT\r\n');
  socket.end();
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SentEmail> {
  if (!to) return { to, subject, delivered: false, error: 'missing recipient' };

  if (env('MAIL_TRANSPORT', 'smtp') === 'console') {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
    return { to, subject, delivered: true };
  }

  try {
    await sendSmtp(to, subject, text);
    return { to, subject, delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email] delivery failed to ${to}: ${message}`);
    return { to, subject, delivered: false, error: message };
  }
}
