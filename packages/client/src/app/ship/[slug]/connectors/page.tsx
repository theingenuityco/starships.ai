import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { ConnectorsSettingsContent } from '@/components/connectors/ConnectorsSettingsContent'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Connectors | Starships.ai',
    description: 'Manage connectors for your starship.',
  }
}

export default async function ConnectorsPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <ConnectorsSettingsContent slug={slug} />
    </JwtAuthGate>
  )
}
