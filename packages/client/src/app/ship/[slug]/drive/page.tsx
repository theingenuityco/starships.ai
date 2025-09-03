import { Metadata } from 'next'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { DriveContent } from '@/components/drive/DriveContent'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `${slug} Drive Systems | Starships AI`,
    description: `Drive systems for starship ${slug}`,
  }
}

export default async function StarshipDrivePage({ params }: PageProps) {
  const { slug } = await params

  return (
    <JwtAuthGate>
      <DriveContent slug={slug} />
    </JwtAuthGate>
  )
}
