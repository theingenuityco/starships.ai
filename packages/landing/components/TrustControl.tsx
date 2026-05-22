import { BurnMotif } from './BurnMotif';
import { FadeIn } from './FadeIn';
import { Icon } from './Icon';

type Facet = {
  key: 'approvals' | 'burn' | 'transparency';
  title: string;
  body: string;
};

const facets: Facet[] = [
  {
    key: 'approvals',
    title: 'Approvals',
    body: 'You sign off before anything irreversible. Allow, ask, or deny, action by action.',
  },
  {
    key: 'burn',
    title: 'Burn visibility',
    body: "See your starship's total burn, live. Track spend by room and agent, to the dollar.",
  },
  {
    key: 'transparency',
    title: 'Full transparency',
    body: "Open any conversation and follow an agent's reasoning. Halt one agent, a room, or everything.",
  },
];

// Each motif animates a small, specific story for its card.
function Motif({ kind }: { kind: Facet['key'] }) {
  if (kind === 'approvals') {
    // Three pending actions wave, then converge and blend into a single approval check.
    return (
      <div className="flex h-10 items-center text-(--color-fg-muted)">
        <div className="relative h-6 w-6">
          <span className="approve-dot-l absolute left-[4px] top-[9px]">
            <span className="dot-wave block h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          <span className="approve-dot-m absolute left-[11px] top-[9px]">
            <span className="dot-wave block h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '0.2s' }} />
          </span>
          <span className="approve-dot-r absolute left-[18px] top-[9px]">
            <span className="dot-wave block h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '0.4s' }} />
          </span>
          <span className="approve-reveal absolute inset-0 flex items-center justify-center rounded-full bg-(--color-success)/15">
            <Icon name="check" className="h-3.5 w-3.5 text-(--color-success)" />
          </span>
        </div>
      </div>
    );
  }

  if (kind === 'burn') {
    // Streaming spend histogram: new bars grow in, old ones drop off, arrow flips with the trend.
    return <BurnMotif />;
  }

  // The live feed populates line by line while the eye blinks.
  return (
    <div className="flex h-10 items-center gap-2.5 text-(--color-fg-muted)">
      <Icon name="eye" className="eye-blink h-5 w-5" />
      <span className="flex flex-col gap-1.5">
        <span className="feed-line h-0.5 w-10 rounded-full bg-current" />
        <span className="feed-line h-0.5 w-7 rounded-full bg-current" style={{ animationDelay: '0.3s' }} />
        <span className="feed-line h-0.5 w-8 rounded-full bg-current" style={{ animationDelay: '0.6s' }} />
      </span>
    </div>
  );
}

export function TrustControl() {
  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <FadeIn as="span" className="block" delay={0}>
            You are in full control.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
            Every action.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={180}>
            Every dollar.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={270}>
            Every step.
          </FadeIn>
        </h2>

        <div className="mt-24 grid grid-cols-1 gap-5 sm:mt-32 sm:grid-cols-3">
          {facets.map((f, i) => (
            <FadeIn
              key={f.key}
              delay={140 + i * 90}
              className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6"
            >
              <Motif kind={f.key} />
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-3 leading-relaxed text-(--color-fg-muted)">{f.body}</p>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
