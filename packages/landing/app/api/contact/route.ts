import { NextResponse } from 'next/server';
import { sendLeadEmails, type Lead } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 2000;

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;

  // Honeypot. If the hidden "company_url" field is filled, drop silently.
  if (clean(payload.company_url)) {
    return NextResponse.json({ ok: true });
  }

  const lead: Lead = {
    name: clean(payload.name),
    email: clean(payload.email),
    website: clean(payload.website),
    useCase: clean(payload.useCase),
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
    await sendLeadEmails(lead);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/contact] Failed to send lead emails', err);
    return NextResponse.json({ error: 'Could not send your message right now. Please email hello@starships.ai directly.' }, { status: 500 });
  }
}
