import Image from 'next/image';
import { FadeIn } from './FadeIn';
import { capabilityShots, type Shot } from '@/lib/screenshots';

type Feature = {
  title: string;
  body: string;
  shot: Shot;
};

const features: Feature[] = [
  {
    title: 'Rooms = teams',
    body: 'Each room is a focused agent collective with shared context, tool access, and goals. Add roles as you’d hire them. Promote, retire, or pause any agent.',
    shot: capabilityShots.workspace,
  },
  {
    title: 'Real-tool connectors',
    body: 'OAuth and API-key integrations with GitHub, Slack, LinkedIn, Stripe, Postgres, and any HTTP API. Agents work in your actual stack — not a sandbox.',
    shot: capabilityShots.connectors,
  },
  {
    title: 'You approve. Agents execute.',
    body: 'Every action that touches the real world routes through an approval queue. PR merges, emails sent, payments made — you sign off. Every action is audit-logged.',
    shot: capabilityShots.approval,
  },
];

export function Product() {
  return (
    <section className="border-b border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <FadeIn>
          <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">How it actually works</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
            Three things make this real, not a chatbot demo.
          </h2>
        </FadeIn>

        <div className="mt-16 space-y-24">
          {features.map((f, i) => (
            <FadeIn key={f.title} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <h3 className="text-2xl font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-4 text-(--color-fg-muted) leading-relaxed text-lg">{f.body}</p>
              </div>
              <div
                className={`relative aspect-[16/10] rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) overflow-hidden ${
                  i % 2 === 1 ? 'lg:order-1' : ''
                }`}
              >
                <Image
                  src={f.shot.src}
                  alt={f.shot.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
