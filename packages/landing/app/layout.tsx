import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Starships — The agent platform you can actually ship on',
  description:
    'Multi-tenant, connector-rich, production-grade agent infrastructure. Stop building the boring parts and start shipping real products.',
  metadataBase: new URL('https://starships.ai'),
  openGraph: {
    title: 'Starships — The agent platform you can actually ship on',
    description:
      'Multi-tenant, connector-rich, production-grade agent infrastructure. Stop building the boring parts and start shipping real products.',
    url: 'https://starships.ai',
    siteName: 'Starships',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships — The agent platform you can actually ship on',
    description:
      'Multi-tenant, connector-rich, production-grade agent infrastructure. Stop building the boring parts and start shipping real products.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
