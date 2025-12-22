import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { TopupSuccessView } from '@/components/billing/TopupSuccessView'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Top-up Successful - Starships.ai',
    description: 'Your recent wallet top-up has been completed successfully.',
  }
}

export default async function TopupSuccessPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <TopupSuccessView slug={slug} />
    </JwtAuthGate>
  )
}
