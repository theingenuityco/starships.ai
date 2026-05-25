import { Resend } from 'resend';

type MailerEnv = {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  notificationTo: string;
  bookingUrl: string;
  enabled: boolean;
};

function readEnv(): MailerEnv {
  const enabledRaw = process.env.LANDING_ENABLE_EMAILS;
  const enabled = enabledRaw === undefined ? true : enabledRaw.toLowerCase() === 'true';
  return {
    apiKey: process.env.LANDING_RESEND_API_KEY || '',
    fromAddress: process.env.LANDING_EMAIL_FROM_ADDRESS || 'stella@mail.starships.ai',
    fromName: process.env.LANDING_EMAIL_FROM_NAME || 'Stella from Starships',
    notificationTo: process.env.LANDING_NOTIFICATION_TO || 'hello@starships.ai',
    bookingUrl: process.env.LANDING_BOOKING_URL || 'https://cal.com',
    enabled,
  };
}

let cachedClient: Resend | null = null;
function getClient(apiKey: string): Resend {
  if (cachedClient) return cachedClient;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function escapeHtml(unsafe: string): string {
  return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export type Lead = {
  name: string;
  email: string;
  website: string;
  room: string;
  message: string;
  source: string;
};

function notificationHtml(lead: Lead): string {
  const name = escapeHtml(lead.name);
  const email = escapeHtml(lead.email);
  const room = escapeHtml(lead.room || '(not specified)');
  const message = escapeHtml(lead.message || '(not provided)').replace(/\n/g, '<br>');
  const websiteHref = lead.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : '';
  const website = lead.website ? escapeHtml(lead.website) : '';
  const source = lead.source ? escapeHtml(lead.source) : '';

  const row = (label: string, value: string, top = false) =>
    `<tr><td style="padding: 8px 0; color: #6c7585; width: 120px;${top ? ' vertical-align: top;' : ''}">${label}</td><td style="padding: 8px 0;">${value}</td></tr>`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">New landing lead</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${row('Name', name)}
        ${row('Email', `<a href="mailto:${email}">${email}</a>`)}
        ${website ? row('Website', `<a href="${escapeHtml(websiteHref)}">${website}</a>`) : ''}
        ${row('Room', room)}
        ${row('Message', message, true)}
        ${source ? row('Source', source, true) : ''}
      </table>
    </div>
  `.trim();
}

function notificationText(lead: Lead): string {
  return [
    `New landing lead`,
    ``,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Website: ${lead.website || '(not provided)'}`,
    `Room: ${lead.room || '(not specified)'}`,
    `Message: ${lead.message || '(not provided)'}`,
    `Source: ${lead.source || '(none)'}`,
  ].join('\n');
}

function autoReplyHtml(lead: Lead, bookingUrl: string): string {
  const name = escapeHtml(lead.name.split(' ')[0] || lead.name);
  const url = escapeHtml(bookingUrl);
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1d22; line-height: 1.6;">
      <p>Hi ${name},</p>
      <p>Thanks for reaching out about Starships. Pick a slot that works for you and I'll see you there:</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="display: inline-block; background: #5a63ff; color: white; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 500;">Book a 20-min call →</a>
      </p>
      <p>If that link doesn't work for you, just reply to this email and we'll find a time.</p>
      <p style="margin-top: 32px;">— Stella<br><span style="color: #6c7585;">Starships</span></p>
    </div>
  `.trim();
}

function autoReplyText(lead: Lead, bookingUrl: string): string {
  const name = lead.name.split(' ')[0] || lead.name;
  return [
    `Hi ${name},`,
    ``,
    `Thanks for reaching out about Starships. Pick a slot that works for you and I'll see you there:`,
    ``,
    bookingUrl,
    ``,
    `If that link doesn't work for you, just reply to this email and we'll find a time.`,
    ``,
    `— Stella`,
    `Starships`,
  ].join('\n');
}

export async function sendLeadEmails(lead: Lead): Promise<void> {
  const env = readEnv();

  if (!env.enabled) {
    console.warn('[landing/mailer] LANDING_ENABLE_EMAILS=false — skipping send', lead);
    return;
  }

  if (!env.apiKey) {
    console.warn('[landing/mailer] RESEND_API_KEY not set — skipping send');
    return;
  }

  const resend = getClient(env.apiKey);
  const from = `${env.fromName} <${env.fromAddress}>`;

  const results = await Promise.all([
    resend.emails.send({
      from,
      to: [env.notificationTo],
      replyTo: lead.email,
      subject: `New Starships lead: ${lead.name}${lead.room ? ` (${lead.room})` : ''}`,
      html: notificationHtml(lead),
      text: notificationText(lead),
    }),
    resend.emails.send({
      from,
      to: [lead.email],
      subject: 'Thanks for reaching out — book a call with Starships',
      html: autoReplyHtml(lead, env.bookingUrl),
      text: autoReplyText(lead, env.bookingUrl),
    }),
  ]);

  for (const { error } of results) {
    if (error) throw new Error(`Resend error: ${error.message}`);
  }
}
