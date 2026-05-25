'use client';

import { useEffect, useRef, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Icon } from './Icon';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const ROOMS = ['Engineering', 'Sales', 'Marketing', 'Operations', 'Something else'] as const;

const ROOM_PARAM: Record<string, (typeof ROOMS)[number]> = {
  engineering: 'Engineering',
  developers: 'Engineering',
  sales: 'Sales',
  marketing: 'Marketing',
  operations: 'Operations',
  ops: 'Operations',
};

type Payload = {
  name: string;
  email: string;
  website: string;
  room: string;
  message: string;
  source: string;
};

const fieldClass =
  'w-full rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-soft) px-4 py-3 text-[15px] text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:border-(--color-border-strong) transition-colors';

const labelClass = 'mb-2 block text-[11px] font-medium uppercase tracking-wider text-(--color-fg-subtle)';

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [source, setSource] = useState<string>('');

  const turnstileRef = useRef<TurnstileInstance>(null);
  const pendingPayload = useRef<Payload | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const roomParam = params.get('room')?.toLowerCase();
    if (roomParam && ROOM_PARAM[roomParam]) setRoom(ROOM_PARAM[roomParam]);

    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map((k) => {
        const v = params.get(k);
        return v ? `${k}=${v}` : null;
      })
      .filter(Boolean);
    const referrer = document.referrer || '';
    const parts = [...utm];
    if (referrer) parts.push(`referrer=${referrer}`);
    setSource(parts.join(' · '));
  }, []);

  async function submitWithToken(turnstileToken: string) {
    const payload = pendingPayload.current;
    if (!payload) return;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, turnstileToken }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      pendingPayload.current = null;
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      turnstileRef.current?.reset();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();

    if (!name || !email) {
      setStatus('error');
      setErrorMessage('Please fill in your name and email.');
      return;
    }

    pendingPayload.current = {
      name,
      email,
      website: String(formData.get('website') || '').trim(),
      room,
      message: String(formData.get('message') || '').trim(),
      source,
    };

    setStatus('submitting');
    setErrorMessage('');
    turnstileRef.current?.execute();
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  return (
    <div className="overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-bg)">
      <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3 sm:px-6">
        <Icon name="calendar" className="h-4 w-4 text-(--color-fg-subtle)" />
        <span className="text-sm font-semibold text-(--color-fg)">Request a demo</span>
      </div>

      <div className="p-5 sm:p-6">
        {status === 'success' ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-(--color-success)/15 text-(--color-success)">
              <Icon name="check" className="h-6 w-6" />
            </span>
            <p className="mt-5 text-lg font-semibold text-(--color-fg)">Got it. Thanks for reaching out.</p>
            <p className="mt-2 text-(--color-fg-muted)">Check your inbox for the booking link.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                Name
              </label>
              <input id="name" name="name" type="text" required autoComplete="name" className={fieldClass} placeholder="Jane Doe" />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Work email
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} placeholder="jane@company.com" />
            </div>

            <div>
              <label htmlFor="website" className={labelClass}>
                Company website <span className="text-(--color-fg-subtle) normal-case">(optional)</span>
              </label>
              <input
                id="website"
                name="website"
                type="url"
                inputMode="url"
                autoComplete="url"
                className={fieldClass}
                placeholder="https://acme.co"
              />
            </div>

            <div>
              <span className={labelClass}>Which room are you most interested in?</span>
              <div className="flex flex-wrap gap-2">
                {ROOMS.map((r) => {
                  const active = room === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRoom(active ? '' : r)}
                      className={`rounded-(--radius-button) border px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? 'border-(--color-accent) bg-(--color-accent-soft) text-(--color-fg)'
                          : 'border-(--color-border) bg-(--color-bg-soft) text-(--color-fg-muted) hover:border-(--color-border-strong) hover:text-(--color-fg)'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="message" className={labelClass}>
                What do you want your Starship to do?
              </label>
              <textarea
                id="message"
                name="message"
                rows={3}
                className={`${fieldClass} resize-y`}
                placeholder="e.g. We're a dev-tools startup. We'd want agents reviewing PRs and triaging issues."
              />
            </div>

            {status === 'error' && <p className="text-sm text-(--color-warn)">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-(--radius-button) bg-(--color-accent) px-6 py-3 text-sm font-medium text-(--color-bg) shadow-sm transition-colors hover:bg-(--color-accent-strong) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'submitting' ? 'Sending…' : 'Send'}
              {status !== 'submitting' && <Icon name="arrow-right" className="h-4 w-4" />}
            </button>

            <p className="text-xs text-(--color-fg-subtle)">
              Have questions? Email us at{' '}
              <a
                href="mailto:hello@starships.ai"
                className="text-(--color-fg-muted) underline underline-offset-2 hover:text-(--color-fg)"
              >
                hello@starships.ai
              </a>
            </p>

            {siteKey && (
              <Turnstile
                ref={turnstileRef}
                siteKey={siteKey}
                options={{ size: 'invisible', execution: 'execute' }}
                onSuccess={submitWithToken}
                onError={() => {
                  setStatus('error');
                  setErrorMessage('CAPTCHA verification failed. Please try again.');
                }}
                onExpire={() => {
                  setStatus('error');
                  setErrorMessage('CAPTCHA expired. Please try again.');
                  turnstileRef.current?.reset();
                }}
              />
            )}
          </form>
        )}
      </div>
    </div>
  );
}
