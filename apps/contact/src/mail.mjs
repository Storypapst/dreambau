// The e-mail (spec 7.4) and the transport. Visitor text reaches no header except the validated address in Reply-To (7.5).
import nodemailer from 'nodemailer';

const pad = n => String(n).padStart(2, '0');
export const utcMinute = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

export function buildMessage(mailCfg, values, date) {
  const when = utcMinute(date);
  const text = [
    'Nachricht über das Kontaktformular von dreambau.com',
    '',
    `Name:       ${values.name || '(nicht angegeben)'}`,
    `E-Mail:     ${values.email}`,
    `Zeit (UTC): ${when}`,
    '',
    'Nachricht:',
    values.message,
    '',
    '--',
    'Direkt antworten: Reply-To ist die Adresse der absendenden Person.',
    '',
  ].join('\n');
  return {
    from: { name: 'dreambau.com Kontaktformular', address: mailCfg.from },
    to: mailCfg.to,
    replyTo: values.email,
    subject: `Kontaktformular dreambau.com (${when} UTC)`,
    date,
    text,
    textEncoding: 'quoted-printable',
    headers: { 'X-Dreambau-Form': 'contact' },
    envelope: { from: mailCfg.from, to: [mailCfg.to] },
    disableUrlAccess: true,
    disableFileAccess: true,
  };
}

// the default mailer: authenticated submission to CONTACT_SMTP_HOST, nothing else (X6)
export function createMailer(mailCfg) {
  if (!mailCfg.configured) return null;
  const transport = nodemailer.createTransport({
    host: mailCfg.host,
    port: mailCfg.port,
    secure: mailCfg.security === 'tls',
    requireTLS: mailCfg.security === 'starttls',
    ignoreTLS: mailCfg.security === 'none',
    auth: mailCfg.user ? { user: mailCfg.user, pass: mailCfg.password } : undefined,
    tls: mailCfg.servername ? { servername: mailCfg.servername } : undefined,
    connectionTimeout: mailCfg.timeoutMs,
    greetingTimeout: mailCfg.timeoutMs,
    socketTimeout: mailCfg.timeoutMs,
    disableUrlAccess: true,
    disableFileAccess: true,
  });
  return { send: msg => transport.sendMail(msg) };
}
