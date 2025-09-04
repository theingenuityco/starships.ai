'use client'

import { use, useEffect, useState } from 'react'
import { MissionList } from '@/components/missions/MissionList'
import { starshipAPI, type Starship } from '@/lib/api'

interface MissionsPageProps {
  params: Promise<{
    slug: string
  }>
}

export default function MissionsPage({ params }: MissionsPageProps) {
  const { slug } = use(params)
  const [starship, setStarship] = useState<Starship | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadStarship = async () => {
      try {
        const response = await starshipAPI.getStarshipBySlug(slug)
        setStarship(response.starship)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load starship')
      } finally {
        setLoading(false)
      }
    }

    loadStarship()
  }, [slug])

  if (loading) {
    return (
      <div className="h-full bg-background p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error || !starship) {
    return (
      <div className="h-full bg-background p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️ Error</div>
          <p className="text-muted-foreground">{error || 'Starship not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <MissionList starshipId={starship.id} starshipSlug={slug} showCreateButton={true} />
      </div>
    </div>
  )
}
