'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FadeIn } from './FadeIn';

type Item = { situation: string; headline: string; description: string };

// Sticky scrollytelling: text scrolls on the left while the visual stays pinned
// at the vertical center on the right, morphing to match the active text block.
export function UseCasesScroller({ items, visuals }: { items: Item[]; visuals: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf: number | null = null;

    const update = () => {
      const center = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(mid - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive((prev) => (prev === best ? prev : best));
    };

    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        update();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="bg-(--color-bg)">
      <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          <FadeIn as="span" className="block" delay={0}>
            What the room
          </FadeIn>
          <FadeIn as="span" className="block text-(--color-fg-muted)" delay={90}>
            handles for you.
          </FadeIn>
        </h2>

        <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-2 lg:gap-16">
          {/* Left: scrolling text */}
          <div>
            {items.map((item, i) => (
              <div
                key={item.situation}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="py-12 lg:flex lg:min-h-[70vh] lg:flex-col lg:justify-center lg:py-0"
              >
                <div className={`transition-opacity duration-500 ${active === i ? 'lg:opacity-100' : 'lg:opacity-40'}`}>
                  <p className="text-3xl font-semibold tracking-tight leading-[1.05] text-(--color-fg-muted) sm:text-4xl">
                    {item.situation}.
                  </p>
                  <p className="mt-6 text-xl font-semibold tracking-tight">{item.headline}</p>
                  <p className="mt-3 max-w-md text-(--color-fg-muted) leading-relaxed">{item.description}</p>
                </div>
                {/* Inline visual on mobile (no sticky on small screens) */}
                <div className="mt-8 lg:hidden">{visuals[i]}</div>
              </div>
            ))}
          </div>

          {/* Right: pinned, morphing visual (desktop only) */}
          <div className="hidden lg:block">
            <div className="sticky top-[15vh] flex h-[70vh] items-center">
              <div className="grid w-full">
                {visuals.map((v, i) => (
                  <div
                    key={i}
                    aria-hidden={active !== i}
                    className="transition-all duration-500 ease-out"
                    style={{
                      gridArea: '1 / 1',
                      opacity: active === i ? 1 : 0,
                      transform: active === i ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
                      pointerEvents: active === i ? 'auto' : 'none',
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
