import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { EnvironmentSettingsContent } from '@/components/environment/EnvironmentSettingsContent'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `${slug} Environment Settings | Starships AI`,
    description: `Environment variable settings for starship ${slug}`,
  }
}

export default async function EnvironmentSettingsPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <EnvironmentSettingsContent slug={slug} />
    </JwtAuthGate>
  )
}
