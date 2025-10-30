'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)

  useEffect(() => {
    // Wait until we have authentication and starships data
    if (authLoading || starshipsLoading) {
      return
    }

    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }

    // If user has starships, redirect to the first one
    if (starships && starships.length > 0) {
      router.replace(`/ship/${starships[0].slug}/conversations`)
    } else {
      // No starships available - stay on this page or show onboarding
      // For now, show a message that they need to create a starship
      // TODO: Implement starship creation flow or onboarding
      console.log('User has no starships - onboarding needed')
    }
  }, [authLoading, starshipsLoading, isAuthenticated, starships, router])

  // Show loading while checking
  if (authLoading || starshipsLoading) {
    return <AuthLoadingScreen message="Loading your profile..." />
  }

  // User has no starships - show message (temporary until onboarding is implemented)
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to Starships.ai!</h1>
        <p className="text-muted-foreground">Your account is set up, but you don&apos;t have any starships yet.</p>
        <p className="text-sm text-muted-foreground">Please contact support to get your first starship created.</p>
      </div>
    </div>
  )
}
