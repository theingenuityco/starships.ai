import Image from 'next/image';
import { capabilityShots, type Shot } from '@/lib/screenshots';

type Capability = {
  title: string;
  body: string;
  shot: Shot;
};

const capabilities: Capability[] = [
  {
    title: 'Multi-tenant agent workspaces',
    body: 'Rooms, threads, conversations. Named agents with their own roles, prompts, models, and tool permissions. The Slack-shaped surface your customers already know how to use.',
    shot: capabilityShots.workspace,
  },
  {
    title: 'A real connector framework',
    body: 'LinkedIn, Discord, GitHub, Stripe, Postgres, generic HTTP — OAuth and API-key connectors with auth-injection so agents never touch raw credentials. Add your own in hours, not weeks.',
    shot: capabilityShots.connectors,
  },
  {
    title: 'A workflow engine, not a chat loop',
    body: '14 node types. Parallel branches. Conditional logic. Event-driven resumption — agents pause for webhooks, then resume where they left off. Streaming output throughout.',
    shot: capabilityShots.workflow,
  },
  {
    title: 'Approval flows so your agents don’t go rogue',
    body: 'Per-tool, per-agent permissions. Real-time approval gates. Users review what an agent wants to do before it does it. Auditable. Reversible.',
    shot: capabilityShots.approval,
  },
];

export function Capabilities() {
  return (
    <section id="what-it-does" className="border-b border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">What it does</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">Built like infrastructure, not a demo.</h2>

        <div className="mt-16 space-y-24">
          {capabilities.map((cap, i) => (
            <div key={cap.title} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <h3 className="text-2xl font-semibold tracking-tight">{cap.title}</h3>
                <p className="mt-4 text-(--color-fg-muted) leading-relaxed text-lg">{cap.body}</p>
              </div>
              <div
                className={`relative aspect-[16/10] rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) overflow-hidden ${
                  i % 2 === 1 ? 'lg:order-1' : ''
                }`}
              >
                <Image
                  src={cap.shot.src}
                  alt={cap.shot.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
