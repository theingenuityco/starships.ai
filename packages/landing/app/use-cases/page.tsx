import type { Metadata } from 'next';
import Link from 'next/link';
import { FadeIn } from '@/components/FadeIn';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Use Cases — Starships',
  description: 'How engineering, marketing, and sales teams run on Starships.',
};

export const dynamic = 'force-static';

const sections = [
  {
    heading: 'For marketers.',
    body: 'Starships gives marketing teams a set of autonomous agents that research, write, and send — without waiting for someone to kick things off. Outreach sequences drafted the moment a lead enters your CRM. KB articles published the moment a ticket resolves. Status updates posted every morning, without you writing a word.',
    agents: ['Outreach Drafter', 'Campaign Planner', 'KB Writer', 'Status Reporter'],
    href: '/for-marketers',
    cta: 'See the Marketing room',
    // Akram Huseyn — woman at MacBook Pro, dramatic dark studio lighting
    image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Marketer working at laptop in dramatic dark studio lighting',
  },
  {
    heading: 'For developers.',
    body: 'The Engineering room handles the maintenance layer your team never has time for. Every pull request reviewed before a human opens it. Tests written alongside new features. Security scans on every push. Dependencies upgraded weekly with a clean PR. Your engineers stay focused on the product.',
    agents: ['PR Reviewer', 'Test Author', 'Security Scanner', 'Dependency Upgrader'],
    href: '/for-developers',
    cta: 'See the Engineering room',
    // Jefferson Santos — person with headphones focused on laptop in dark workspace
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Developer focused at their screen in a dark workspace',
  },
  {
    heading: 'For sales.',
    body: 'The Sales room keeps your pipeline moving even when you\'re heads-down closing. New leads researched before your first call. CRM updated after every interaction. Follow-ups drafted and queued before anything goes cold. Your reps spend time on conversations, not admin.',
    agents: ['Account Researcher', 'CRM Updater', 'Follow-up Coordinator', 'Ticket Triager'],
    href: '/for-sales',
    cta: 'See the Sales room',
    // Vitaly Gariev — professional working late at desk, moody green/purple ambient glow
    image: 'https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1000&q=85',
    imageAlt: 'Sales professional working late at their desk',
  },
];

export default function UseCasesPage() {
  return (
    <main className="pt-32 pb-0">
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <FadeIn>
          <p className="text-xs font-brand tracking-widest text-(--color-fg-subtle) uppercase mb-4">Use Cases</p>
        </FadeIn>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          <FadeIn as="span" delay={60} className="block">One platform.</FadeIn>
          <FadeIn as="span" delay={120} className="block text-(--color-fg-muted)">Every team.</FadeIn>
        </h1>
        <FadeIn delay={200}>
          <p className="mt-6 max-w-xl text-lg text-(--color-fg-muted) leading-relaxed">
            Starships runs across your whole org. Each team gets their own room, their own agents, and their own goals — all working while you sleep.
          </p>
        </FadeIn>
      </div>

      {sections.map((s, i) => (
        <section key={s.heading} className="bg-(--color-bg)">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            {/* Title spans full width above the two columns */}
            <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl mb-16 sm:mb-20">
              <FadeIn as="span" delay={0} className="block">{s.heading}</FadeIn>
            </h2>

            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-20">

              {/* Image always on left */}
              <FadeIn delay={80} className="relative overflow-hidden rounded-2xl">
                <img
                  src={s.image}
                  alt={s.imageAlt}
                  className="w-full h-[460px] object-cover object-center brightness-75"
                />
                {/* Gradient bleeds right edge of image toward content */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-(--color-bg)/60" />
                {/* Subtle bottom fade */}
                <div className="absolute inset-0 bg-gradient-to-t from-(--color-bg)/40 via-transparent to-transparent" />
              </FadeIn>

              {/* Content always on right */}
              <div>
                <FadeIn delay={120}>
                  <p className="text-lg text-(--color-fg-muted) leading-relaxed">{s.body}</p>
                </FadeIn>
                <FadeIn delay={190}>
                  <div className="mt-8 flex flex-wrap gap-2">
                    {s.agents.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center rounded-full border border-(--color-border) px-3 py-1 text-sm text-(--color-fg-subtle)"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </FadeIn>
                <FadeIn delay={260}>
                  <Link
                    href={s.href}
                    className="mt-10 inline-flex items-center gap-2 rounded-(--radius-button) border border-(--color-border-strong) px-5 py-3 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-elev) transition-colors"
                  >
                    {s.cta} →
                  </Link>
                </FadeIn>
              </div>

            </div>
          </div>
        </section>
      ))}

      <Footer />
    </main>
  );
}
