'use client'

import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { UserProfile } from '@/components/auth/UserProfile'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useAuth } from '@/hooks/useAuth'
import { useSelectedStarship, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { useWallet } from '@/hooks/useWallet'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export function TopRightUserProfile(): React.JSX.Element | null {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user, logout, userName, userEmail, userAvatar } = useAuth()
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
  const activeStarshipName = starshipFromList?.name ?? starshipBySlug?.name ?? null

  const { data: wallet, isLoading: walletLoading } = useWallet(activeStarshipId || '', !!activeStarshipId && isAuthenticated)

  const isImageUrl = useCallback((value?: string | null): boolean => {
    if (!value || typeof value !== 'string') return false
    const trimmed = value.trim()
    return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
  }, [])

  const handleBillingClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings/billing`)
  }, [router, activeStarshipSlug])

  const handleAccountClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings/profile`)
  }, [router, activeStarshipSlug])

  const handleLogoutClick = useCallback(async () => {
    await logout()
    router.push('/')
  }, [logout, router])

  const navMenuItemClassName =
    'group relative rounded-lg flex items-center w-full h-8 px-2 text-[13px] font-medium border border-transparent cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted'
  const navMenuItemIconClassName = 'w-4 h-4'

  if (!isAuthenticated) return null

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          role="link"
          tabIndex={0}
          aria-label="Go to billing"
          onClick={handleBillingClick}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleBillingClick()
            }
          }}
          className="flex items-center gap-2 px-3 py-1 transition-all duration-200 min-w-0 rounded-full text-muted-foreground cursor-pointer hover:bg-muted/40"
        >
          <Icon name="coins" className="w-4 h-4" />
          <span className="min-w-0">
            <BalanceStatusIndicator valueClassName="text-xs" wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={false} inheritTextColor className="min-w-0" />
          </span>
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open user menu"
              className="rounded-full transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <UserProfile mode="collapsed" centerInContainer collapsedSize="md" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl bg-background/95 backdrop-blur-sm border border-border/50 shadow-lg">
            <DropdownMenuLabel className="px-2 py-2 font-normal">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8 rounded-full ring-1 ring-border/40">
                  {isImageUrl(userAvatar) ? (
                    <AvatarImage src={userAvatar!} alt={userName || userEmail || 'User avatar'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="rounded-full object-cover" />
                  ) : null}
                  <AvatarFallback className="rounded-full bg-muted/40">
                    <Icon name="user" className="h-4 w-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight truncate text-foreground">{userName || userEmail || 'Account'}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight min-w-0">
                    <StarshipsLogo width={12} height={12} className="text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{activeStarshipName || 'No starship selected'}</span>
                  </div>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAccountClick} disabled={!activeStarshipSlug} className={navMenuItemClassName}>
              <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
                <Icon name="user" className={navMenuItemIconClassName} />
              </div>
              Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleBillingClick} disabled={!activeStarshipSlug} className={navMenuItemClassName}>
              <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
                <Icon name="credit-card" className={navMenuItemIconClassName} />
              </div>
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogoutClick} className={`${navMenuItemClassName} text-destructive hover:text-destructive focus:text-destructive`}>
              <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
                <Icon name="log-out" className={navMenuItemIconClassName} />
              </div>
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
