import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { IntegrationsSettingsContent } from '@/components/integrations/IntegrationsSettingsContent'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Integrations | Starships.ai',
    description: 'Manage agents, tools, and connectors for your starship.',
  }
}

export default async function IntegrationsPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <IntegrationsSettingsContent slug={slug} />
    </JwtAuthGate>
  )
}

