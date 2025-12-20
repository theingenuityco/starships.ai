'use client'

import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { UserProfile } from '@/components/auth/UserProfile'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { useSelectedStarship, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { useWallet } from '@/hooks/useWallet'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export function TopRightUserProfile(): React.JSX.Element | null {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  const { data: userStarships } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)

  const pathStarshipSlug = useMemo((): string | null => {
    if (typeof pathname !== 'string') return null
    if (!pathname.startsWith('/ship/')) return null
    const parts = pathname.split('/')
    return parts.length > 2 ? parts[2] : null
  }, [pathname])

  const selectedStarshipId = getSelectedStarshipId()

  const starshipFromList = useMemo(() => {
    if (!userStarships?.length) return null
    if (pathStarshipSlug) {
      return userStarships.find(s => s.slug === pathStarshipSlug) ?? null
    }
    if (selectedStarshipId) {
      return userStarships.find(s => s.id === selectedStarshipId) ?? null
    }
    return userStarships[0] ?? null
  }, [userStarships, pathStarshipSlug, selectedStarshipId])

  // Fallback: if we're on /ship/:slug/* but userStarships hasn't loaded yet, fetch the starship by slug to get its ID.
  const { data: starshipBySlug } = useStarshipBySlug(pathStarshipSlug || '', !!pathStarshipSlug && isAuthenticated && !starshipFromList?.id)

  const activeStarshipId = starshipFromList?.id ?? starshipBySlug?.id ?? selectedStarshipId ?? null
  const activeStarshipSlug = starshipFromList?.slug ?? pathStarshipSlug ?? null

  const { data: wallet, isLoading: walletLoading } = useWallet(activeStarshipId || '', !!activeStarshipId && isAuthenticated)

  const handleClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings`)
  }, [router, activeStarshipSlug])

  if (!isAuthenticated) return null

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] flex items-center gap-1.5 px-2 py-0.5 transition-all duration-200 min-w-0 rounded-full">
          <Icon name="coins" className="w-3.5 h-3.5" />
          <span className="min-w-0">
            <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={false} inheritTextColor className="min-w-0" />
          </span>
        </Badge>
        <UserProfile mode="collapsed" onClick={handleClick} centerInContainer />
      </div>
    </div>
  )
}
