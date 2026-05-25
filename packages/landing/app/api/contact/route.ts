import { NextResponse } from 'next/server';
import { sendLeadEmails, type Lead } from '@/lib/mailer';
import { appendLeadToNotion } from '@/lib/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 2000;

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD);
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.LANDING_TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[api/contact] TURNSTILE_SECRET_KEY not set — skipping CAPTCHA verification');
    return true;
  }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;

  const turnstileToken = clean(payload.turnstileToken);
  if (!turnstileToken) {
    return NextResponse.json({ error: 'CAPTCHA token missing.' }, { status: 400 });
  }

  const verified = await verifyTurnstile(turnstileToken);
  if (!verified) {
    return NextResponse.json({ error: 'CAPTCHA verification failed. Please try again.' }, { status: 403 });
  }

  const lead: Lead = {
    name: clean(payload.name),
    email: clean(payload.email),
    website: clean(payload.website),
    room: clean(payload.room),
    message: clean(payload.message),
    source: clean(payload.source),
  };

  if (!lead.name || !lead.email) {
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
  }

  if (!EMAIL_RE.test(lead.email)) {
    return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
  }

  try {
    await Promise.all([
      sendLeadEmails(lead),
      appendLeadToNotion(lead).catch((err) => console.error('[api/contact] Notion append failed', err)),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/contact] Failed to send lead emails', err);
    return NextResponse.json({ error: 'Could not send your message right now. Please email hello@starships.ai directly.' }, { status: 500 });
  }
}
