'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships, useEnsureDefaultStarship } from '@/hooks/useStarships'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)
  const ensureDefault = useEnsureDefaultStarship()
  const ensureAttempted = useRef(false)

  useEffect(() => {
    if (authLoading || starshipsLoading) return
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    if (starships && starships.length > 0) {
      router.replace(`/ship/${starships[0].slug}`)
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
  }, [authLoading, starshipsLoading, isAuthenticated, starships, router, ensureDefault])

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Welcome to Starships.ai!</h1>
          <p className="text-muted-foreground">Your account is set up, but we couldn&apos;t create a workspace.</p>
          <p className="text-sm text-muted-foreground">Please try again or contact support.</p>
        </div>
      </div>
    )
  }

  return <AuthLoadingScreen message="Redirecting..." />
}
