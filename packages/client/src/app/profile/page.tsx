'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

/**
 * Profile: redirect to first starship or to onboarding when user has no starships.
 * We do not create a default starship here; users with no starship go to onboarding
 * where they can either "Join with invite link" (no default created) or "New Workspace"
 * (default created when they click Next on step 1).
 */
export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)

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
    if (starships && starships.length === 0) {
      router.replace('/onboarding')
    }
  }, [authLoading, starshipsLoading, isAuthenticated, starships, router])

  if (authLoading || starshipsLoading) {
    return <AuthLoadingScreen message="Loading your profile..." />
  }

  if (starships && starships.length === 0) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  return <AuthLoadingScreen message="Redirecting..." />
}
