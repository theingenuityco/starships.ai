import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpen } from 'lucide-react';

/**
 * Shared Layout Configuration for Starships.ai
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Starships.ai',
      transparentMode: 'top',
    },
    links: [
      {
        text: 'Introduction',
        url: '/',
        icon: <BookOpen key="docs-icon" className="size-4" />,
        active: 'nested-url',
      },
    ],
    githubUrl: 'https://github.com/starships-ai',
  };
}
