import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

type SesEnv = {
  region: string;
  fromAddress: string;
  fromName: string;
  notificationTo: string;
  bookingUrl: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  enabled: boolean;
};

function readEnv(): SesEnv {
  const enabledRaw = process.env.LANDING_ENABLE_EMAILS;
  const enabled = enabledRaw === undefined ? true : enabledRaw.toLowerCase() === 'true';
  return {
    region: process.env.LANDING_AWS_SES_REGION || 'ap-south-1',
    fromAddress: process.env.LANDING_EMAIL_FROM_ADDRESS || 'hello@starships.ai',
    fromName: process.env.LANDING_EMAIL_FROM_NAME || 'Starships',
    notificationTo: process.env.LANDING_NOTIFICATION_TO || 'hello@starships.ai',
    bookingUrl: process.env.LANDING_BOOKING_URL || 'https://cal.com',
    accessKeyId: process.env.LANDING_AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.LANDING_AWS_SECRET_ACCESS_KEY || undefined,
    enabled,
  };
}

let cachedClient: SESClient | null = null;
function getClient(env: SesEnv): SESClient {
  if (cachedClient) return cachedClient;
  cachedClient = new SESClient({
    region: env.region,
    ...(env.accessKeyId && env.secretAccessKey
      ? { credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey } }
      : {}),
  });
  return cachedClient;
}

function escapeHtml(unsafe: string): string {
  return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export type Lead = {
  name: string;
  email: string;
  company: string;
};

async function sendOne(env: SesEnv, to: string, subject: string, html: string, text: string, replyTo?: string) {
  const client = getClient(env);
  const command = new SendEmailCommand({
    Source: `${env.fromName} <${env.fromAddress}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' },
      },
    },
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
  });
  await client.send(command);
}

function notificationHtml(lead: Lead): string {
  const name = escapeHtml(lead.name);
  const email = escapeHtml(lead.email);
  const company = escapeHtml(lead.company || '(not provided)').replace(/\n/g, '<br>');
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">New landing lead</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #6c7585; width: 120px;">Name</td><td style="padding: 8px 0;">${name}</td></tr>
        <tr><td style="padding: 8px 0; color: #6c7585;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding: 8px 0; color: #6c7585; vertical-align: top;">Company / building</td><td style="padding: 8px 0;">${company}</td></tr>
      </table>
    </div>
  `.trim();
}

function notificationText(lead: Lead): string {
  return [`New landing lead`, ``, `Name: ${lead.name}`, `Email: ${lead.email}`, `Company / building: ${lead.company || '(not provided)'}`].join(
    '\n'
  );
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
      <p style="margin-top: 32px;">— Rudra<br><span style="color: #6c7585;">Starships</span></p>
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
    `— Rudra`,
    `Starships`,
  ].join('\n');
}

export async function sendLeadEmails(lead: Lead): Promise<void> {
  const env = readEnv();

  if (!env.enabled) {
    console.warn('[landing/mailer] LANDING_ENABLE_EMAILS=false — skipping send', lead);
    return;
  }

  // Notification to internal inbox — keep visitor email as reply-to so you can reply directly.
  await sendOne(
    env,
    env.notificationTo,
    `New Starships lead: ${lead.name}${lead.company ? ` (${lead.company.slice(0, 40)}${lead.company.length > 40 ? '…' : ''})` : ''}`,
    notificationHtml(lead),
    notificationText(lead),
    lead.email
  );

  // Auto-reply with booking link.
  await sendOne(
    env,
    lead.email,
    'Thanks for reaching out — book a call with Starships',
    autoReplyHtml(lead, env.bookingUrl),
    autoReplyText(lead, env.bookingUrl)
  );
}
