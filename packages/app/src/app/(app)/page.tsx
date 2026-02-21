'use client'

import { useAuth } from '@/hooks/useAuth'
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AppIndexPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  const selectedStarshipId = getSelectedStarshipId()
  const { data: starships = [], isLoading } = useUserStarships(user?.id ?? '', Boolean(user?.id))
  const primary = pickPrimaryStarshipForUser(starships ?? [], user?.id, selectedStarshipId)

  useEffect(() => {
    if (!isAuthenticated) return
    if (!user) return
    if (isLoading) return

    if (primary?.slug) {
      router.replace(`/ship/${encodeURIComponent(primary.slug)}`)
      return
    }

    router.replace('/onboarding')
  }, [isAuthenticated, user, isLoading, primary?.slug, router])

  return <div className="min-h-[60vh] w-full" />
}

