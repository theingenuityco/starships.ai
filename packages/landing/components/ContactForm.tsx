'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      company: String(formData.get('company') || '').trim(),
      website: String(formData.get('website') || '').trim(),
    };

    if (!payload.name || !payload.email) {
      setStatus('error');
      setErrorMessage('Please fill in your name and email.');
      return;
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      form.reset();
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Get in touch</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Tell us what you&rsquo;re building.</h2>
          <p className="mt-4 text-lg text-(--color-fg-muted) leading-relaxed">
            Leave your name and a line or two about what you&rsquo;re working on. We&rsquo;ll reply with a booking link.
          </p>

        {status === 'success' ? (
          <div className="mt-10 rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-8">
            <p className="text-(--color-fg) text-lg">Got it. Thanks for reaching out.</p>
            <p className="mt-2 text-(--color-fg-muted)">Check your inbox for the booking link.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            {/* Honeypot — bots fill this; humans don't see it. */}
            <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-(--color-fg-muted) mb-2">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="w-full rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-elev) px-4 py-3 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:border-(--color-accent) transition-colors"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-(--color-fg-muted) mb-2">
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-elev) px-4 py-3 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:border-(--color-accent) transition-colors"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-(--color-fg-muted) mb-2">
                Company / what you&rsquo;re building
              </label>
              <textarea
                id="company"
                name="company"
                rows={3}
                className="w-full rounded-(--radius-button) border border-(--color-border) bg-(--color-bg-elev) px-4 py-3 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:border-(--color-accent) transition-colors resize-y"
                placeholder="A line or two helps us prepare for the call."
              />
            </div>

            {status === 'error' && <p className="text-sm text-red-400">{errorMessage}</p>}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="inline-flex items-center justify-center rounded-(--radius-button) bg-(--color-accent) px-6 py-3 text-sm font-medium text-(--color-bg) hover:bg-(--color-accent-strong) transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'submitting' ? 'Sending…' : 'Send'}
            </button>

            <p className="text-xs text-(--color-fg-subtle)">
              Or email us directly at{' '}
              <a href="mailto:hello@starships.ai" className="text-(--color-fg-muted) hover:text-(--color-fg) underline underline-offset-2">
                hello@starships.ai
              </a>
              .
            </p>
          </form>
        )}
        </div>
      </div>
    </section>
  );
}
