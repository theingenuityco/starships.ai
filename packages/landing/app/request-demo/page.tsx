import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Request demo — Starships',
  description: "Tell us what you're building. We'll reply with a booking link.",
};

const steps = [
  {
    n: '01',
    title: 'We send you a booking link',
    body: 'A reply lands in your inbox with a link to grab a time that works for you.',
  },
  {
    n: '02',
    title: 'We tailor your Starship',
    body: 'We configure the rooms and staff a crew of agents around how your team actually works.',
  },
  {
    n: '03',
    title: 'We hand you the keys',
    body: 'Walk through it live on the call, then direct it yourself. You stay in control of every action.',
  },
];

// Absolute delays (ms) for a sequential top-to-bottom chain triggered on mount.
const STEP_BASE = 440;
const STEP_STRIDE = 150;
const stepDelay = (i: number, offset: number) => STEP_BASE + i * STEP_STRIDE + offset;

export default function ContactPage() {
  return (
    <main>
      <section className="bg-(--color-bg)">
        <div className="mx-auto max-w-5xl px-6 pt-44 pb-24 sm:pt-52 sm:pb-32">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
            {/* Left: the pitch, then the onboarding flow. */}
            <div>
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                <FadeIn as="span" delay={0} immediate className="block">
                  Tell us what you do.
                </FadeIn>
                <FadeIn as="span" delay={100} immediate className="block text-(--color-fg-muted)">
                  We&rsquo;ll build the rest.
                </FadeIn>
              </h1>
              <FadeIn delay={220} immediate>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-(--color-fg-muted)">
                  All we need is a few details to get started.
                </p>
              </FadeIn>

              <div className="mt-12">
                <FadeIn delay={340} immediate>
                  <p className="font-brand text-xs uppercase tracking-widest text-(--color-fg-subtle)">What happens next</p>
                </FadeIn>
                <div className="mt-8 space-y-8">
                  {steps.map((s, i) => {
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={s.n} className="grid grid-cols-[36px_1fr] gap-5">
                        <div className="relative flex justify-center">
                          {!isLast && (
                            <FadeIn as="span" delay={stepDelay(i, 70)} immediate className="absolute left-1/2 top-9 -bottom-8 w-px -translate-x-1/2 bg-(--color-border)" aria-hidden>
                              {''}
                            </FadeIn>
                          )}
                          <FadeIn delay={stepDelay(i, 0)} immediate>
                            <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-(--color-border-strong) bg-(--color-bg-elev) font-mono text-sm text-(--color-fg)">
                              {s.n}
                            </span>
                          </FadeIn>
                        </div>
                        <div className="pt-1">
                          <FadeIn as="h3" delay={stepDelay(i, 50)} immediate className="text-lg font-semibold tracking-tight text-(--color-fg)">
                            {s.title}
                          </FadeIn>
                          <FadeIn as="p" delay={stepDelay(i, 90)} immediate className="mt-2 text-[15px] leading-relaxed text-(--color-fg-muted)">
                            {s.body}
                          </FadeIn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: the form, pinned as the left column scrolls. */}
            <div className="lg:sticky lg:top-32">
              <FadeIn delay={200} immediate>
                <ContactForm />
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
