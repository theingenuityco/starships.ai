import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Starships.ai Documentation',
    template: '%s | Starships.ai',
  },
  description:
    'Build the future of AI-powered applications with Starships.ai - Your comprehensive platform for deploying intelligent agents at scale',
  keywords: [
    'AI',
    'Artificial Intelligence',
    'AI Agents',
    'Machine Learning',
    'GPT-4',
    'Claude',
    'LLM',
    'Documentation',
    'Developer Tools',
  ],
  authors: [{ name: 'Starships.ai' }],
  creator: 'Starships.ai',
  metadataBase: new URL('https://starships.ai/docs'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://starships.ai/docs',
    title: 'Starships.ai Documentation',
    description: 'Build the future of AI-powered applications with Starships.ai',
    siteName: 'Starships.ai',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai Documentation',
    description: 'Build the future of AI-powered applications with Starships.ai',
    creator: '@starshipsai',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.className} dark`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            options: {
              api: '/docs/api/search',
            },
          }}
          theme={{
            enabled: false,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
