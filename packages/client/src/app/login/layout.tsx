import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Starships.ai - Login',
  description: 'Sign in to your Starships.ai account to access your AI agents, tools, and automations. Ship production AI agents fast.',
  alternates: {
    canonical: 'https://starships.ai/login',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Starships.ai - Login',
    description: 'Sign in to your Starships.ai account to access your AI agents, tools, and automations. Ship production AI agents fast.',
    url: 'https://starships.ai/login',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.png',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Login',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai - Login',
    description: 'Sign in to your Starships.ai account to access your AI agents, tools, and automations. Ship production AI agents fast.',
    images: ['/static-assets/og.png'],
  },
  robots: {
    index: false, // Don't index login pages
    follow: true,
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
