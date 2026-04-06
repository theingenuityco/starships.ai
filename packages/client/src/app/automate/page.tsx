import type { Metadata } from 'next'
import { AutomateFlow } from './AutomateFlow'

export const metadata: Metadata = {
  title: 'Automate my startup — Starships.ai',
  description: 'Tell us about your startup and we\'ll help you find your ideal customers and set up your first automated workflow.',
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Automate my startup — Starships.ai',
    description: 'Tell us about your startup and we\'ll help you find your ideal customers and set up your first automated workflow.',
    url: 'https://starships.ai/automate',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai — Automate my startup',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Automate my startup — Starships.ai',
    description: 'Tell us about your startup and we\'ll help you find your ideal customers.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function AutomatePage() {
  return <AutomateFlow />
}
