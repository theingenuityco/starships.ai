'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import Icon from '@/components/primitives/Icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { pickPrimaryStarshipForUser, useSelectedStarship, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { isImageUrl } from '@/lib/isImageUrl'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

interface UserProfileMenuProps {
  expanded?: boolean
}

export function UserProfileMenu({ expanded = false }: UserProfileMenuProps): React.JSX.Element | null {
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
    return pickPrimaryStarshipForUser(userStarships, user?.id, selectedStarshipId)
  }, [userStarships, pathStarshipSlug, selectedStarshipId, user?.id])

  // Fallback: if we're on /ship/:slug/* but userStarships hasn't loaded yet, fetch the starship by slug to get its ID.
  const { data: starshipBySlug } = useStarshipBySlug(pathStarshipSlug || '', !!pathStarshipSlug && isAuthenticated && !starshipFromList?.id)

  const activeStarshipId = starshipFromList?.id ?? starshipBySlug?.id ?? selectedStarshipId ?? null
  const activeStarshipSlug = starshipFromList?.slug ?? pathStarshipSlug ?? null
  const activeStarshipName = starshipFromList?.name ?? starshipBySlug?.name ?? null

  const canManageBilling = Boolean(isAuthenticated && user?.id && activeStarshipId && (user?.isInstanceAdmin === true || (starshipFromList?.ownerId ?? starshipBySlug?.ownerId) === user.id))

  const handleBillingClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings/billing`)
  }, [router, activeStarshipSlug])

  const handleAccountClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings/my-profile`)
  }, [router, activeStarshipSlug])

  const handleMyStarshipClick = useCallback(() => {
    if (!activeStarshipSlug) return
    router.push(`/ship/${activeStarshipSlug}/settings/my-starship`)
  }, [router, activeStarshipSlug])

  const handleLogoutClick = useCallback(async () => {
    await logout()
    router.push('/')
  }, [logout, router])

  const navMenuItemClassName =
    'group relative rounded-lg flex items-center w-full h-8 px-2 text-[13px] font-medium border border-transparent cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted'
  const navMenuItemIconClassName = 'w-4 h-4'

  const controlClassName =
    'cursor-pointer rounded-full bg-background/70 shadow-sm ring-1 ring-border/50 text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

  if (!isAuthenticated) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {expanded ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Open user menu"
            className="h-10 w-full justify-start gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <UserProfile mode="collapsed" centerInContainer collapsedSize="md" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[13px] font-medium leading-tight truncate text-foreground">{userName || userEmail || 'Account'}</span>
              <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground min-w-0">
                <StarshipsLogo width={12} height={12} className="flex-shrink-0" idleLoop={false} />
                <span className="truncate">{activeStarshipName || 'No starship selected'}</span>
              </span>
            </span>
            <Icon name="chevron-up" className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" aria-label="Open user menu" className={`${controlClassName} h-10 w-10`}>
            <UserProfile mode="collapsed" centerInContainer collapsedSize="md" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-lg bg-card !border-0 ring-1 ring-border/60 dark:ring-border shadow-md">
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 rounded-full ring-1 ring-border/40">
              {isImageUrl(userAvatar) ? (
                <AvatarImage src={userAvatar!} alt={userName || userEmail || 'User avatar'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="rounded-full object-cover" />
              ) : null}
              <AvatarFallback className="rounded-full bg-muted/40">
                <Icon name="user" className="h-5 w-5 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight truncate text-foreground">{userName || userEmail || 'Account'}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight min-w-0">
                <StarshipsLogo width={14} height={14} className="flex-shrink-0" idleLoop={false} />
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
          My Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMyStarshipClick} disabled={!activeStarshipSlug} className={navMenuItemClassName}>
          <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
            <Icon name="rocket" className={navMenuItemIconClassName} />
          </div>
          My Starship
        </DropdownMenuItem>
        {canManageBilling ? (
          <DropdownMenuItem onClick={handleBillingClick} disabled={!activeStarshipSlug} className={navMenuItemClassName}>
            <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
              <Icon name="credit-card" className={navMenuItemIconClassName} />
            </div>
            Billing
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className={navMenuItemClassName}
          onSelect={e => {
            // Keep the menu open while toggling theme.
            e.preventDefault()
          }}
        >
          <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
            <Icon name="moon" className={navMenuItemIconClassName} />
          </div>
          <div className="flex items-center justify-between w-full gap-3">
            <span>Theme</span>
            <div className="shrink-0">
              <ThemeToggle size="xs" />
            </div>
          </div>
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
  )
}
