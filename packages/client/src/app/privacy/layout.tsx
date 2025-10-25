import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Starships.ai - Privacy Policy',
  description: 'Learn how Starships.ai collects, uses, and protects your personal information. GDPR compliant privacy policy with transparent data practices.',
  alternates: {
    canonical: 'https://starships.ai/privacy',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Starships.ai - Privacy Policy',
    description: 'Learn how Starships.ai collects, uses, and protects your personal information. GDPR compliant privacy policy with transparent data practices.',
    url: 'https://starships.ai/privacy',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.png',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Privacy Policy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai - Privacy Policy',
    description: 'Learn how Starships.ai collects, uses, and protects your personal information. GDPR compliant privacy policy with transparent data practices.',
    images: ['/static-assets/og.png'],
  },
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children
}
