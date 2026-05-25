import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { Nav } from '@/components/Nav';
import { PostHogProvider } from '@/components/PostHogProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['400', '500', '700'] });

const title = 'Starships — Your startup, on autopilot';
const description =
  'Starship (noun): a new generation of startup, built natively around autonomous AI agents.';

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL('https://starships.ai'),
  openGraph: {
    title,
    description,
    url: 'https://starships.ai',
    siteName: 'Starships',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable}`}>
      <body suppressHydrationWarning>
        {/* Runs synchronously before browser scroll restoration fires — always start at top on reload */}
        <Script id="scroll-restoration" strategy="beforeInteractive">{`history.scrollRestoration='manual'`}</Script>
        <PostHogProvider>
          <Nav />
          {children}
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
