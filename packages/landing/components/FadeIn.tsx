'use client';

import { useEffect, useRef } from 'react';

interface FadeInProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  delay?: number;
  as?: React.ElementType;
  /** Skip scroll detection and chain animations from page load instead. */
  immediate?: boolean;
}

export function FadeIn({ children, delay = 0, className = '', as: Tag = 'div', style, immediate = false, ...rest }: FadeInProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (immediate) {
      // Let the browser paint the initial hidden state, then hand control to CSS animation-delay.
      const raf = requestAnimationFrame(() => {
        el.classList.remove('fade-will-animate');
        el.classList.add('animate-fade-up');
      });
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.remove('fade-will-animate');
          el.classList.add('animate-fade-up');
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -120px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [immediate]);

  return (
    <Tag
      ref={ref}
      {...rest}
      className={`fade-will-animate ${className}`}
      style={{ '--delay': `${delay}ms`, ...style } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
