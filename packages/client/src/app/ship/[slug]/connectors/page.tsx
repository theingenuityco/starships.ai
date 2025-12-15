import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { ConnectorsSettingsContent } from '@/components/connectors/ConnectorsSettingsContent'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `${slug} Connectors | Starships AI`,
    description: `Connectors for starship ${slug}`,
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
