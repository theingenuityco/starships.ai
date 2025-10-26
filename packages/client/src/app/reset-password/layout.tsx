import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Starships.ai - Reset Password',
  description: 'Create a new password for your Starships.ai account.',
  alternates: {
    canonical: 'https://starships.ai/reset-password',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Starships.ai - Reset Password',
    description: 'Create a new password for your Starships.ai account.',
    url: 'https://starships.ai/reset-password',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.png',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Password Reset',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai - Reset Password',
    description: 'Create a new password for your Starships.ai account.',
    images: ['/static-assets/og.png'],
  },
  robots: {
    index: false, // Don't index password reset pages
    follow: false,
  },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
