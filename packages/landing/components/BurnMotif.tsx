'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const BAR_COUNT = 6;
const MIN_BAR = 6;
const MAX_BAR = 20;

const randomBar = () => Math.round(MIN_BAR + Math.random() * (MAX_BAR - MIN_BAR));

type Bar = { id: number; height: number };

// Streaming spend histogram: a new bar grows in on the right, the oldest drops off
// the left, and whether the new bar is taller or shorter sets the trend arrow.
export function BurnMotif() {
  const nextId = useRef(BAR_COUNT);
  const lastHeight = useRef(12);
  const [bars, setBars] = useState<Bar[]>(() => Array.from({ length: BAR_COUNT }, (_, i) => ({ id: i, height: 12 })));
  const [trend, setTrend] = useState<'up' | 'down'>('up');

  useEffect(() => {
    setBars(Array.from({ length: BAR_COUNT }, (_, i) => ({ id: i, height: randomBar() })));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => {
      const height = randomBar();
      setTrend(height >= lastHeight.current ? 'up' : 'down');
      lastHeight.current = height;
      setBars((prev) => [...prev.slice(1), { id: nextId.current++, height }]);
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-10 items-center gap-2.5 text-(--color-fg-muted)">
      <span className="flex h-8 items-end gap-[3px] border-b border-(--color-border)">
        {bars.map((bar, i) => (
          <span
            key={bar.id}
            className={`w-[3px] rounded-t-sm bg-current ${i === bars.length - 1 ? 'burn-grow' : ''}`}
            style={{ height: `${bar.height}px` }}
          />
        ))}
      </span>
      <span className="flex items-center gap-0.5 text-(--color-fg)">
        <Icon key={trend} name={trend === 'up' ? 'chevron-up' : 'chevron-down'} className="burn-arrow h-3.5 w-3.5" />
        <span className="font-mono text-sm font-semibold">$</span>
      </span>
    </div>
  );
}
