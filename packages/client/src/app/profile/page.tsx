'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { pickPrimaryStarshipForUser, useEnsureDefaultStarship, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

/**
 * Profile: redirect to first starship, or create a default workspace when user has none.
 * New users (0 starships) get a workspace created via ensure-default-starship, then redirect to ship.
 * Join-via-invite users use /accept-invite; after accepting they have a starship and land on ship.
 */
export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()
  const selectedStarshipId = getSelectedStarshipId()
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)
  const ensureDefault = useEnsureDefaultStarship()
  // Prevent double-call when effect re-runs (e.g. deps change); reset on error so user can retry.
  const ensureAttempted = useRef(false)

  useEffect(() => {
    if (authLoading || starshipsLoading) return
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    if (starships && starships.length > 0) {
      const primary = pickPrimaryStarshipForUser(starships, user?.id, selectedStarshipId)
      router.replace(`/ship/${(primary ?? starships[0]).slug}`)
      return
    }
    if (starships && starships.length === 0 && !ensureAttempted.current) {
      ensureAttempted.current = true
      void ensureDefault
        .mutateAsync()
        .then(ship => router.replace(`/ship/${ship.slug}`))
        .catch(() => {
          ensureAttempted.current = false
        })
    }
  }, [authLoading, starshipsLoading, isAuthenticated, starships, router, ensureDefault, user?.id, selectedStarshipId])

  // Loading or creating workspace
  if (authLoading || starshipsLoading || (starships?.length === 0 && ensureDefault.isPending)) {
    return <AuthLoadingScreen message={starships?.length === 0 && ensureDefault.isPending ? 'Creating your workspace...' : 'Loading your profile...'} />
  }

  // Waiting for redirect after ensure (avoid flash of "no starships" message)
  if (starships?.length === 0 && ensureDefault.isSuccess) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  // No starships and ensure failed (e.g. network error)
  if (starships && starships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">Welcome to Starships.ai!</h1>
          <p className="text-muted-foreground">Your account is set up, but we couldn&apos;t create a workspace.</p>
          <p className="text-sm text-muted-foreground">Please try again or contact support.</p>
        </div>
      </div>
    )
  }

  return <AuthLoadingScreen message="Redirecting..." />
}
