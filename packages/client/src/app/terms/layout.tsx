import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Starships.ai',
  description: 'Read the terms and conditions for using Starships.ai. Understand your rights, responsibilities, and our service agreements.',
  alternates: {
    canonical: 'https://starships.ai/terms',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Terms of Service | Starships.ai',
    description: 'Read the terms and conditions for using Starships.ai. Understand your rights, responsibilities, and our service agreements.',
    url: 'https://starships.ai/terms',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Terms of Service',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service | Starships.ai',
    description: 'Read the terms and conditions for using Starships.ai. Understand your rights, responsibilities, and our service agreements.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
