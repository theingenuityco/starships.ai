'use client';

import { useEffect, useRef, useState } from 'react';
import { FadeIn } from './FadeIn';

type Item = { text: string; comment: string };

const items: Item[] = [
  { text: 'annoying auth bug in prod - FIX ASAP', comment: 'Reproduced the bug, opened PR #432. Awaiting your review.' },
  { text: 'followup with Broke Inc for payments', comment: 'Sent polite escalation, scheduled follow-up for Thursday.' },
  { text: 'IMP! reply to the investor before Friday', comment: 'Drafted response with updated metrics. Awaiting your sign-off.' },
  { text: 'figure out a pricing model, finish the pricing page', comment: 'Ran 3 pricing scenarios, drafted page copy. Awaiting your review.' },
  { text: 'reply to 47 support tickets. NOW!', comment: 'Triaged all 47. 39 auto-resolved, 8 flagged for you.' },
  { text: 'lunch???', comment: 'Ordered from Sweetgreen. Arriving at 12:45.' },
  { text: 'fix staging (again!!!)', comment: 'Restarted services, redeployed. Green for 14 minutes.' },
  { text: 'interview with potential eng candidate', comment: 'Sent prep notes and rubric. Calendar block confirmed for 3pm.' },
  { text: 'draft proposal for ABC Enterprise', comment: 'Pulled their RFP, drafted proposal v1. Awaiting your review.' },
  { text: 'update the CRM lol', comment: 'Logged 12 interactions in HubSpot. All caught up.' },
  { text: 'send out those marketing mails by EOD today', comment: 'Personalized 4 segments, scheduled send for 5pm.' },
];

type ItemState = 'idle' | 'working' | 'done';

function StatusBadge({ state }: { state: ItemState }) {
  if (state === 'idle') return null;
  const isWorking = state === 'working';
  const wrapperClass = isWorking
    ? 'border-(--color-warn)/40 bg-(--color-warn)/10 text-(--color-warn)'
    : 'border-(--color-success)/40 bg-(--color-success)/10 text-(--color-success)';
  const dotClass = isWorking ? 'animate-pulse bg-(--color-warn)' : 'bg-(--color-success)';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors duration-500 ${wrapperClass}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full transition-colors duration-500 ${dotClass}`} />
      {isWorking ? 'working' : 'done'}
    </span>
  );
}

function ItemRow({
  item,
  state,
  setRef,
}: {
  item: Item;
  state: ItemState;
  setRef: (el: HTMLLIElement | null) => void;
}) {
  const isWorking = state === 'working';
  const isDone = state === 'done';

  return (
    <li
      ref={setRef}
      className={`rounded-(--radius-card) border bg-(--color-bg-elev) px-5 py-4 transition-colors duration-500 ${
        isDone
          ? 'border-(--color-success)/30'
          : isWorking
            ? 'border-(--color-warn)/40'
            : 'border-(--color-border)'
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-300 ${
            isDone
              ? 'border-(--color-success) bg-(--color-success)'
              : isWorking
                ? 'border-(--color-warn)'
                : 'border-(--color-border)'
          }`}
        >
          {isDone ? (
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-(--color-bg)" aria-hidden>
              <path
                d="M3 8.5l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : isWorking ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-warn)" />
          ) : null}
        </span>
        <span
          className={`flex-1 leading-relaxed transition-all duration-300 ${
            isDone ? 'text-(--color-fg-subtle) line-through' : 'text-(--color-fg-muted)'
          }`}
        >
          {item.text}
        </span>
        <StatusBadge state={state} />
      </div>
      <div
        className={`grid transition-all duration-500 ease-out ${
          isDone ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="ml-9 flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-success)/15 ring-1 ring-(--color-success)/30">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-(--color-success)" aria-hidden>
                <path d="M8 0.5 L9.4 6.6 L15.5 8 L9.4 9.4 L8 15.5 L6.6 9.4 L0.5 8 L6.6 6.6 Z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-(--color-fg)">Agent</span>
                <span className="text-xs text-(--color-fg-subtle)">just now</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-(--color-fg-muted)">{item.comment}</p>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function PainPoints() {
  const [states, setStates] = useState<ItemState[]>(() => items.map(() => 'idle'));
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    let rafId: number | null = null;

    function update() {
      const vh = window.innerHeight;
      const lineWorking = vh * (2 / 3); // y-coordinate of the 2/3-from-top line
      const lineDone = vh * (1 / 3); // y-coordinate of the 1/3-from-top line

      setStates((prev) => {
        const next = prev.slice();
        let changed = false;
        refs.current.forEach((el, i) => {
          if (!el) return;
          const top = el.getBoundingClientRect().top;
          let newState: ItemState = 'idle';
          if (top < lineDone) newState = 'done';
          else if (top < lineWorking) newState = 'working';
          if (next[i] !== newState) {
            next[i] = newState;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }

    function onScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section>
      <div className="mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <FadeIn as="span" className="block" delay={0}>
            You are the bottleneck.
          </FadeIn>
          <FadeIn as="span" className="block" delay={90}>
            AI is the leverage.
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={180}>
            But you&rsquo;re still copy-pasting.
          </FadeIn>
        </h2>

        <FadeIn as="p" className="mt-28 text-xl font-semibold tracking-tight text-(--color-fg) sm:mt-32 sm:text-2xl">
          Put AI to work instead
        </FadeIn>

        <FadeIn className="mt-6 max-w-2xl rounded-(--radius-card) border border-(--color-border) bg-(--color-bg)">
          <div className="px-5 pt-4 pb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-(--color-fg-subtle)">Your to-do list</span>
          </div>
          <ul className="space-y-2 px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
            {items.map((item, i) => (
              <ItemRow
                key={item.text}
                item={item}
                state={states[i]}
                setRef={(el) => {
                  refs.current[i] = el;
                }}
              />
            ))}
          </ul>
        </FadeIn>
      </div>
    </section>
  );
}
