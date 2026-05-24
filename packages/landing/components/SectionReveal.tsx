'use client';

import { useState, useRef, useEffect, createContext, useContext } from 'react';
import type { ReactNode, ElementType, HTMLAttributes } from 'react';

const Ctx = createContext(false);

export function SectionReveal({ children }: { children: ReactNode }) {
  const [inView, setInView] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -120px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Ctx.Provider value={inView}>
      <div ref={sentinel} aria-hidden style={{ height: 0 }} />
      {children}
    </Ctx.Provider>
  );
}

interface ChainItemProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
}

export function ChainItem({ children, delay = 0, className = '', as: Tag = 'div', style, ...rest }: ChainItemProps) {
  const inView = useContext(Ctx);
  return (
    <Tag
      {...rest}
      className={`${inView ? 'animate-fade-up' : 'fade-will-animate'} ${className}`}
      style={{ '--delay': `${delay}ms`, ...style } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
