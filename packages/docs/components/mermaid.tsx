'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

export interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Detect dark mode from HTML class or CSS variables
    const detectTheme = () => {
      const htmlElement = document.documentElement;
      const isDarkMode = htmlElement.classList.contains('dark') || 
                        htmlElement.getAttribute('data-theme') === 'dark' ||
                        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(isDarkMode);
    };

    detectTheme();
    
    // Listen for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
    });

    const renderChart = async () => {
      if (!ref.current) return;
      
      try {
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, chart);
        ref.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        ref.current.innerHTML = `<pre>${chart}</pre>`;
      }
    };

    renderChart();
  }, [chart, isDark]);

  return <div ref={ref} className="mermaid-chart my-4" />;
}