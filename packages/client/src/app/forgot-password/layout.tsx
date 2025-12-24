import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Forgot Password | Starships.ai',
  description: 'Reset your Starships.ai password. Enter your email to receive a password reset link.',
  alternates: {
    canonical: 'https://starships.ai/forgot-password',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Forgot Password | Starships.ai',
    description: 'Reset your Starships.ai password. Enter your email to receive a password reset link.',
    url: 'https://starships.ai/forgot-password',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Password Reset',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forgot Password | Starships.ai',
    description: 'Reset your Starships.ai password. Enter your email to receive a password reset link.',
    images: ['/static-assets/og.jpg'],
  },
  robots: {
    index: false, // Don't index password reset pages
    follow: false,
  },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
