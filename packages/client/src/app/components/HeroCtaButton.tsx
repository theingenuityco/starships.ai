'use client'

import { Button } from '@/components/ui/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'
import { StarshipsLogo } from '@/components/ui/starships-logo'

/**
 * CTA button that uses useAuth/useQueryClient. Rendered only after client mount
 * so SSR does not run inside QueryClientProvider and trigger "No QueryClient set".
 */
export function HeroCtaButton() {
  const router = useRouter()
  const { isAuthenticated, user, isLoading: authLoading, getToken } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()
  const { data: starships = [], isLoading: starshipsLoading } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = pickPrimaryStarshipForUser(starships, user?.id, getSelectedStarshipId())
  const [heroLogoTrigger, setHeroLogoTrigger] = useState(0)
  const [isPrimaryAnimating, setIsPrimaryAnimating] = useState(false)
  const pendingPrimaryActionRef = useRef<null | (() => void)>(null)
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasClientAuthToken, setHasClientAuthToken] = useState(false)
  const hasAuthToken = hasClientAuthToken
  const shouldBlockCtaWhileResolving = hasAuthToken && (authLoading || starshipsLoading)

  useEffect(() => {
    let has = false
    try {
      has = !!getToken()
    } catch {
      has = false
    }
    setHasClientAuthToken(has)
  }, [getToken])

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    }
  }, [])

  const runPendingPrimaryAction = useCallback(() => {
    const fn = pendingPrimaryActionRef.current
    if (!fn) return
    pendingPrimaryActionRef.current = null
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    fn()
  }, [])

  const navigatePrimary = useCallback(() => {
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
      return
    }
    router.push('/login')
  }, [isAuthenticated, primaryStarship?.slug, router])

  const handlePrimaryClick = useCallback(() => {
    if (isPrimaryAnimating) return
    if (shouldBlockCtaWhileResolving) return

    track({ type: 'hero_cta_clicked' })
    setIsPrimaryAnimating(true)
    pendingPrimaryActionRef.current = () => {
      navigatePrimary()
      setIsPrimaryAnimating(false)
    }
    setHeroLogoTrigger(v => v + 1)
    fallbackTimeoutRef.current = setTimeout(() => {
      runPendingPrimaryAction()
    }, 1100)
  }, [authLoading, hasAuthToken, isAuthenticated, isPrimaryAnimating, navigatePrimary, primaryStarship?.slug, runPendingPrimaryAction, shouldBlockCtaWhileResolving, starships, starshipsLoading])

  return (
    <Button
      size="lg"
      className="h-14 sm:h-16 w-full sm:w-auto max-w-[22rem] sm:max-w-none px-6 sm:px-10 text-lg sm:text-xl leading-none overflow-hidden rounded-full whitespace-normal break-words text-center [&_svg]:!w-12 [&_svg]:!h-12 disabled:opacity-100 disabled:bg-primary disabled:text-primary-foreground"
      onClick={handlePrimaryClick}
      disabled={isPrimaryAnimating || shouldBlockCtaWhileResolving}
      aria-busy={isPrimaryAnimating || shouldBlockCtaWhileResolving}
    >
      <span className="inline-flex w-12 h-12 items-center justify-center mr-2">
        <StarshipsLogo
          width={48}
          height={48}
          className="text-primary-foreground"
          gradientId="hero-starships-logo-gradient"
          idleLoop={false}
          activeStroke="currentColor"
          triggerAnimation={heroLogoTrigger}
          onEntryAnimationComplete={runPendingPrimaryAction}
        />
      </span>
      {shouldBlockCtaWhileResolving ? (
        <span className="flex flex-col items-start text-left min-w-0 leading-tight">
          <span>Loading your starship</span>
          <span className="-mt-0.5 text-xs sm:text-sm font-normal text-primary-foreground/80 truncate max-w-[18rem] sm:max-w-[22rem]">Just a moment…</span>
        </span>
      ) : isAuthenticated ? (
        <span className="flex flex-col items-start text-left min-w-0 leading-tight">
          <span>Enter my starship</span>
          <span className="-mt-0.5 text-xs sm:text-sm font-normal text-primary-foreground/80 truncate max-w-[18rem] sm:max-w-[22rem]">{primaryStarship?.name || 'Your starship'}</span>
        </span>
      ) : (
        'Get started for free'
      )}
    </Button>
  )
}
