import type { Metadata } from 'next'

import StarryBackground from '@/app/components/StarryBackground'
import { PublicFooter } from '@/app/components/PublicFooter'
import PublicHeader from '@/components/navigation/PublicHeader'
import { StarTheme } from '@/components/theme-context'

import EmailHero from '@/app/new/components/EmailHero'
import PainContrast from '@/app/new/components/PainContrast'
import HowItWorks from '@/app/new/components/HowItWorks'
import SpeedStats from '@/app/new/components/SpeedStats'
import EmailShowcase from '@/app/new/components/EmailShowcase'
import SocialProof from '@/app/new/components/SocialProof'
import EmailFinalCTA from '@/app/new/components/EmailFinalCTA'

export const dynamic = 'force-static'
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Starships.ai | Fully Automated Email Marketing at Warp Speed',
  description:
    'Starships.ai discovers your ICPs, finds 10,000+ leads, enriches each contact, and writes a genuinely personalized email — automatically. No SDRs. No templates. Just results.',
  alternates: {
    canonical: 'https://starships.ai/new',
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Starships.ai | Outreach at Warp Speed',
    description: '10,000 leads enriched in 60 seconds. Every email personalized. Zero SDRs.',
    url: 'https://starships.ai/new',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai automated email marketing — outreach at warp speed',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai | Outreach at Warp Speed',
    description: '10,000 leads enriched in 60 seconds. Every email personalized. Zero SDRs.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function NewLandingPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-[#050b24] relative">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <StarryBackground className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />

        {/* Bottom glow for the whole page */}
        <div
          className="absolute inset-x-0 bottom-[10vh] h-[120vh] pointer-events-none z-[1]"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse 1000px 700px at 50% 94%, rgba(168,85,247,0.16), transparent 65%)',
              'radial-gradient(ellipse 1200px 850px at 50% 96%, rgba(139,92,246,0.12), transparent 70%)',
              'radial-gradient(ellipse 1400px 1000px at 50% 100%, rgba(99,102,241,0.10), transparent 75%)',
              'radial-gradient(ellipse 1300px 950px at 50% 97%, rgba(59,130,246,0.08), transparent 72%)',
              'radial-gradient(ellipse 1600px 1150px at 50% 103%, rgba(124,58,237,0.05), transparent 78%)',
            ].join(', '),
          }}
          aria-hidden
        />

        {/* Foreground content */}
        <div className="relative z-10">
          <PublicHeader />
          <div className="overflow-x-hidden">
            <EmailHero />
            <PainContrast />
            <HowItWorks />
            <SpeedStats />
            <EmailShowcase />
            <SocialProof />
            <EmailFinalCTA />
            <PublicFooter fromPath="/new" continuesLandingBackground topDividerVariant="landingDark" />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}

