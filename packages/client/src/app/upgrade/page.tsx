'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { orderStarshipsOwnedFirst, pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'

export default function UpgradeRedirectPage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()
  const selectedStarshipId = getSelectedStarshipId()
  const { data: starships = [], isLoading: isStarshipsLoading } = useUserStarships(user?.id ?? '', Boolean(user?.id))

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.replace('/login?returnUrl=%2Fupgrade')
      return
    }

    if (isStarshipsLoading) return

    const primary = pickPrimaryStarshipForUser(starships, user?.id, selectedStarshipId)
    const fallback = orderStarshipsOwnedFirst(starships, user?.id)[0] ?? null
    const targetStarship = primary ?? fallback

    if (!targetStarship) {
      router.replace('/onboarding')
      return
    }

    router.replace(`/ship/${encodeURIComponent(targetStarship.slug)}/settings/upgrade`)
  }, [isAuthenticated, isLoading, isStarshipsLoading, router, selectedStarshipId, starships, user?.id])

  return <div className="min-h-[40vh]" />
}
