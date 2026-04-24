import type { Metadata } from 'next'
import { OnboardingFlow } from './OnboardingFlow'

export const metadata: Metadata = {
  title: 'Get started — Starships.ai',
  description: 'Tell us about your startup and we\'ll help you find your ideal customers and set up your first automated workflow.',
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Get started — Starships.ai',
    description: 'Tell us about your startup and we\'ll help you find your ideal customers and set up your first automated workflow.',
    url: 'https://starships.ai/onboarding',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai — Get started',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get started — Starships.ai',
    description: 'Tell us about your startup and we\'ll help you find your ideal customers.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function OnboardingPage() {
  return <OnboardingFlow />
}
