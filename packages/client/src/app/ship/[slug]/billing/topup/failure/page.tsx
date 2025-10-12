import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { TopupFailureView } from '@/components/billing/TopupFailureView'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  return {
    title: `Top-up Failed | ${slug} | Starships AI`,
    description: `Your latest wallet top-up for starship ${slug} did not complete. Review details and next steps.`,
  }
}

export default async function TopupFailurePage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <TopupFailureView slug={slug} />
    </JwtAuthGate>
  )
}
