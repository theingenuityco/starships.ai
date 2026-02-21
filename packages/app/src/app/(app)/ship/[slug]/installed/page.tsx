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
    title: 'Installed | Starships.ai',
    description: 'Manage agents, automations, and connectors installed in your starship.',
  }
}

export default async function InstalledPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <IntegrationsSettingsContent slug={slug} />
    </JwtAuthGate>
  )
}


