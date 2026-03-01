'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { StarshipRail } from '@/components/navigation/StarshipRail'
import { UserProfileMenu } from '@/components/auth/UserProfileMenu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { orderStarshipsOwnedFirst, pickPrimaryStarshipForUser, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { useWallet } from '@/hooks/useWallet'
import { NOTIFICATION_QUERY_KEYS, useNotificationsList } from '@/hooks/useNotifications'

import { motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface NavigationProps {
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

function starshipMonogram(name: string): string {
  const cleaned = String(name || '').trim()
  if (!cleaned) return 'S'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'S'
  const second = parts.length > 1 ? parts[1]?.[0] : undefined
  return (first + (second ?? '')).toUpperCase()
}

// (All items are composed into a single NavigationSection below)

export function Navigation(props: NavigationProps) {
  const { isMobile = false, isOpen = true, onClose } = props
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user, isInstanceAdmin } = useAuth()

  // Keep these stable so effects/callbacks don't churn.
  const getSelectedStarshipId = useCallback((): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return localStorage.getItem('selectedStarshipId')
    } catch {
      return null
    }
  }, [])

  const setSelectedStarship = useCallback((starshipId: string | null) => {
    if (typeof window === 'undefined') return
    try {
      if (starshipId) localStorage.setItem('selectedStarshipId', starshipId)
      else localStorage.removeItem('selectedStarshipId')
    } catch {
      /* ignore */
    }
  }, [])

  // Navbar expansion state (GPT-style: expanded by default, collapsible)
  // On mobile, always expanded (no collapse functionality)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCollapsing, setIsCollapsing] = useState(false)

  // Keep logo stable during collapse animation.
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearCollapseTimeout = useCallback(() => {
    if (!collapseTimeoutRef.current) return
    try {
      clearTimeout(collapseTimeoutRef.current)
    } finally {
      collapseTimeoutRef.current = null
    }
  }, [])

  const collapseSidebar = useCallback(() => {
    if (isMobile) return
    setIsCollapsing(true)
    setIsExpanded(false)
    clearCollapseTimeout()
    // Match the CSS transition duration (300ms)
    collapseTimeoutRef.current = setTimeout(() => {
      setIsCollapsing(false)
    }, 300)
  }, [clearCollapseTimeout, isMobile])

  const expandSidebar = useCallback(() => {
    if (isMobile) return
    clearCollapseTimeout()
    setIsCollapsing(false)
    setIsExpanded(true)
  }, [clearCollapseTimeout, isMobile])

  // Force expanded state on mobile
  useEffect(() => {
    if (isMobile) {
      setIsExpanded(true)
      setIsCollapsing(false)
    }
  }, [isMobile])

  // When Explore is selected, collapse the sidebar to give more space for browsing (icons-only rail).
  const isMarketplaceRoute = pathname === '/explore' || pathname.startsWith('/explore/') || pathname === '/marketplace' || pathname.startsWith('/marketplace/')
  useEffect(() => {
    if (!isMobile && isMarketplaceRoute) {
      collapseSidebar()
    }
  }, [collapseSidebar, isMobile, isMarketplaceRoute])
  // State for logo animation trigger
  const [animationTrigger, setAnimationTrigger] = useState(0)
  // State for navigation starship slug
  const [navigationStarshipSlug, setNavigationStarshipSlug] = useState<string | null>(null)

  // Cleanup any collapse timeout on unmount
  useEffect(() => clearCollapseTimeout, [clearCollapseTimeout])

  // Get user starships to find a default starship
  const { data: userStarships } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const railStarships = useMemo(() => orderStarshipsOwnedFirst(userStarships ?? [], user?.id), [userStarships, user?.id])

  // Extract starship slug from path
  const getStarshipSlug = () => {
    if (pathname.startsWith('/ship/')) {
      const pathParts = pathname.split('/')
      return pathParts[2] // /ship/<slug>/...
    }
    return null
  }

  const pathStarshipSlug = getStarshipSlug()

  // Update navigation starship slug based on context
  useEffect(() => {
    if (pathStarshipSlug) {
      // If we're on a starship route, use that starship
      setNavigationStarshipSlug(pathStarshipSlug)
    } else {
      const selectedStarshipId = getSelectedStarshipId()
      const primary = pickPrimaryStarshipForUser(userStarships ?? [], user?.id, selectedStarshipId)
      setNavigationStarshipSlug(primary?.slug ?? null)
    }
  }, [pathStarshipSlug, userStarships, getSelectedStarshipId])

  const starshipSlug = navigationStarshipSlug
  const activeStarshipSlug = pathStarshipSlug || starshipSlug

  const replaceStarshipSlugInPath = useCallback(
    (nextSlug: string): string => {
      const p = typeof pathname === 'string' ? pathname : ''
      if (!p.startsWith('/ship/')) {
        return `/ship/${nextSlug}`
      }
      // If we're in a specific conversation, don't carry the conversationId across starships.
      // It may not exist / be accessible in the destination starship.
      if (p.includes('/conversations/') || p.includes('/channels/') || p.includes('/rooms/') || p.includes('/dm/')) {
        return `/ship/${nextSlug}`
      }
      const parts = p.split('/')
      // /ship/<slug>/...
      if (parts.length >= 3) {
        parts[2] = nextSlug
        return parts.join('/')
      }
      return `/ship/${nextSlug}`
    },
    [pathname]
  )

  const handleStarshipSelect = useCallback(
    (s: { id: string; slug: string }) => {
      setSelectedStarship(s.id)
      router.push(replaceStarshipSlugInPath(s.slug))
      if (isMobile && onClose) onClose()
    },
    [setSelectedStarship, router, replaceStarshipSlugInPath, isMobile, onClose]
  )

  // Memoize route checks to prevent unnecessary recalculations
  const routeChecks = useMemo(() => {
    if (!starshipSlug) {
      return {
        isInstalledRoute: false,
        isSchedulesRoute: false,
        isMembersRoute: false,
      }
    }
    return {
      isInstalledRoute: pathname.startsWith(`/ship/${starshipSlug}/installed`),
      isSchedulesRoute: pathname.startsWith(`/ship/${starshipSlug}/schedules`),
      isMembersRoute: pathname.startsWith(`/ship/${starshipSlug}/members`),
    }
  }, [pathname, starshipSlug])

  const { isInstalledRoute, isSchedulesRoute, isMembersRoute } = routeChecks

  // Get starship data to access starship ID - only fetch when needed
  const { data: starshipData } = useStarshipBySlug(starshipSlug || '', !!starshipSlug && isAuthenticated)
  const starshipId = starshipData?.id ? String(starshipData.id) : null

  const canManageConnectors = useMemo(() => {
    if (!user?.id) return false
    if (!starshipData?.id) return false
    return Boolean(isInstanceAdmin === true || String(starshipData.ownerId) === String(user.id))
  }, [isInstanceAdmin, starshipData?.id, starshipData?.ownerId, user?.id])
  const queryClient = useQueryClient()

  // Badge data:
  // Prefer live unread counts if an SSE notifications stream is already mounted somewhere else
  // (e.g. conversation list). Otherwise fall back to the list endpoint.
  const streamKey = useMemo(() => (starshipId ? NOTIFICATION_QUERY_KEYS.stream(starshipId) : null), [starshipId])
  const streamChunks = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!streamKey) return () => {}
        const sameKey = (a: unknown, b: unknown): boolean => {
          if (!Array.isArray(a) || !Array.isArray(b)) return false
          if (a.length !== b.length) return false
          for (let i = 0; i < a.length; i++) if ((a as any)[i] !== (b as any)[i]) return false
          return true
        }
        const cache = queryClient.getQueryCache()
        const unsub = cache.subscribe(event => {
          try {
            const qk = (event as any)?.query?.queryKey
            if (!sameKey(qk, streamKey)) return
            onStoreChange()
          } catch {
            /* ignore */
          }
        })
        return () => {
          try {
            unsub()
          } catch {
            /* ignore */
          }
        }
      },
      [queryClient, streamKey]
    ),
    useCallback(() => {
      if (!streamKey) return null
      try {
        const data = queryClient.getQueryData(streamKey)
        return Array.isArray(data) ? (data as any[]) : null
      } catch {
        return null
      }
    }, [queryClient, streamKey]),
    () => null
  )
  const { data: notifList } = useNotificationsList(starshipId, Boolean(isAuthenticated && starshipId))
  const unreadTotal = useMemo(() => {
    const chunks = Array.isArray(streamChunks) ? (streamChunks as any[]) : []
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i] as any
      if (c?.type === 'notification.state' && c?.data?.unread) {
        const n = Number(c.data.unread.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
      if (c?.type === 'snapshot' && c?.data?.unread) {
        const n = Number(c.data.unread.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
    }
    const fallback = Number((notifList as any)?.unread?.totalUnread ?? 0)
    return Number.isFinite(fallback) ? fallback : 0
  }, [streamChunks, notifList])

  const canManageBilling = Boolean(isAuthenticated && user?.id && starshipData?.id && (isInstanceAdmin === true || starshipData.ownerId === user.id))
  const { data: wallet, isLoading: walletLoading } = useWallet(starshipData?.id ?? '', Boolean(canManageBilling && starshipData?.id))

  // Handle logo/name click - memoized
  const handleLogoClick = useCallback(() => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
    // Prefer routing into the active starship (ship root redirects to default channel).
    if (activeStarshipSlug) {
      router.push(`/ship/${activeStarshipSlug}`)
      if (isMobile && onClose) onClose()
      return
    }
    // Fallback to landing screen
    router.push('/')
    if (isMobile && onClose) onClose()
  }, [activeStarshipSlug, isMobile, onClose, router])

  // Header click: expand when collapsed, otherwise go to landing
  const handleHeaderClick = useCallback(() => {
    if (!isExpanded) {
      expandSidebar()
      return
    }
    handleLogoClick()
  }, [isExpanded, expandSidebar, handleLogoClick])

  // Memoize main navigation items - only recalculate when dependencies change
  // Include Recents in the same hierarchy when collapsed
  const mainNavigationItems = useMemo(
    () => [
      ...(isAuthenticated && starshipSlug
        ? [
            {
              href: `/ship/${starshipSlug}/members`,
              label: 'Members',
              icon: 'users',
              isActive: isMembersRoute,
            },
            {
              href: `/ship/${starshipSlug}/datasets`,
              label: 'Datasets',
              icon: 'database',
              isActive: pathname.startsWith(`/ship/${starshipSlug}/datasets`),
            },
          ]
        : []),
      ...(isAuthenticated && starshipSlug && canManageConnectors
        ? [
            {
              href: `/ship/${starshipSlug}/installed`,
              label: 'Connect Apps',
              icon: 'plug',
              isActive: isInstalledRoute,
            },
          ]
        : []),
      ...(isAuthenticated && starshipSlug
        ? [
            {
              href: `/ship/${starshipSlug}/schedules`,
              label: 'Schedules',
              icon: 'clock',
              isActive: isSchedulesRoute,
            },
          ]
        : []),
      ...(isAuthenticated && isInstanceAdmin
        ? [
            {
              href: '/admin/connector-templates',
              label: 'Admin',
              icon: 'shield-check',
              isActive: pathname.startsWith('/admin'),
            } as const,
          ]
        : []),
    ],
    [
      isAuthenticated,
      isMarketplaceRoute,
      starshipSlug,
      pathname,
      isSchedulesRoute,
      isInstalledRoute,
      isMembersRoute,
      isInstanceAdmin,
      canManageConnectors,
    ]
  )

  const handleSidebarBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isExpanded) return
      // If click originated from a button/link/interactive element, ignore
      const target = e.target as HTMLElement
      if (target.closest('button, a, [role="button"], input, label')) {
        return
      }
      expandSidebar()
    },
    [expandSidebar, isExpanded]
  )

  const handleConversationSelect = useCallback(() => {
    if (isMobile && onClose) onClose()
  }, [isMobile, onClose])

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isMobile && isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-40" style={{ backdropFilter: 'blur(2px)' }} />
      )}

      {/* Navigation sidebar */}
      <motion.div
        data-navigation-sidebar
        initial={isMobile ? { x: '-100%' } : false}
        animate={isMobile ? { x: isOpen ? 0 : '-100%' } : {}}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={`group/navigation flex flex-col h-full overflow-hidden bg-card ${isMobile ? 'fixed left-0 top-0 z-50' : 'transition-all duration-300 ease-in-out'}`}
        style={{ willChange: isMobile ? 'transform' : 'width', cursor: !isMobile && !isExpanded ? 'e-resize' : 'auto' }}
        onClick={handleSidebarBackgroundClick}
      >
        {/* Top: rail + main column */}
        <div className="flex flex-1 min-h-0 flex-row overflow-hidden">
          {isAuthenticated ? (
            <StarshipRail
              starships={railStarships}
              activeSlug={activeStarshipSlug}
              onSelect={handleStarshipSelect as any}
              onCreate={() => router.push('/account')}
            />
          ) : null}

          <div
            className="flex flex-col transition-all duration-300 ease-in-out"
            style={{
              width: isExpanded ? '15rem' : '3.25rem',
              height: '100%',
              willChange: 'width',
              contain: 'layout style paint',
            }}
          >
          {/* Header – logo, brand, and collapse toggle */}
          <div className="pl-2 pr-2 pt-5 pb-1.5 flex-shrink-0 flex items-center justify-between gap-2 min-w-0">
            <div
              className="text-muted-foreground hover:text-foreground flex flex-1 min-w-0 items-center justify-start gap-0 rounded-lg px-1.5 py-1 hover:bg-muted/70 dark:hover:bg-[#2C2C30] transition-colors"
              onClick={handleHeaderClick}
              title={isMobile ? undefined : isExpanded ? 'Go to default channel' : 'Expand sidebar'}
              style={{ cursor: isMobile ? 'default' : 'pointer' }}
            >
              {/* Collapsed: show a compact "expand" affordance (and unread dot). Expanded: no leading icon slot. */}
              {!isExpanded ? (
                <div className="relative flex h-6 w-6 items-center justify-center rounded-md transition-colors group-hover/navigation:bg-muted/70 dark:group-hover/navigation:bg-[#2C2C30]">
                  <Icon name="sidebar" className="h-4 w-4" aria-hidden />
                  {unreadTotal > 0 ? (
                    <span
                      className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500/90 shadow-sm"
                      aria-label={`${unreadTotal > 99 ? '99+' : unreadTotal} unread notifications`}
                      title={`${unreadTotal > 99 ? '99+' : unreadTotal} unread notifications`}
                    />
                  ) : null}
                </div>
              ) : null}
              {isExpanded ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-1 min-w-0 items-center gap-1.5"
                  title={starshipData?.name || 'Starships.ai'}
                >
                  <span className="block min-w-0 flex-1 text-sm font-medium tracking-tight leading-snug truncate">
                    {starshipData?.name || 'Starships.ai'}
                  </span>
                </motion.div>
              ) : null}
            </div>
            {/* Right-side actions: notifications (icon only) + close/collapse */}
            <div className="flex items-center gap-0.5">
              {isAuthenticated && starshipSlug && isExpanded && (
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/ship/${starshipSlug}/notifications`)
                    if (isMobile && onClose) onClose()
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30] transition-colors"
                  aria-label={unreadTotal > 0 ? `${unreadTotal} unread notifications` : 'Notifications'}
                  title={unreadTotal > 0 ? `${unreadTotal} unread notifications` : 'Notifications'}
                >
                  <span className="relative inline-flex">
                    <Icon name="bell" className="h-4 w-4" />
                    {unreadTotal > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500/90 shadow-sm" aria-hidden />}
                  </span>
                </button>
              )}
              {isExpanded && !isMobile && (
                <button
                  type="button"
                  onClick={() => {
                    collapseSidebar()
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30] transition-colors"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  style={{ cursor: 'w-resize' }}
                >
                  <Icon name="sidebar" className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Divider below starship name/header */}
          <div className="ml-2 mr-1.5 h-px bg-border/60" />

          {/* Navigation Content - directly under header */}
          <div
            className="flex-shrink-0"
            style={{
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
              paddingTop: '0rem',
              paddingBottom: isAuthenticated && starshipSlug && starshipData?.id && isExpanded ? '0' : '0.5rem',
            }}
          >
            <div className="flex flex-col space-y-0 w-full pl-2 pr-1.5">
              <NavigationSection title="Navigation" items={mainNavigationItems} pathname={pathname} expanded={isExpanded} onItemClick={isMobile && onClose ? onClose : undefined} />
              {/* Divider to clearly separate primary navigation from channels/DMs */}
              <div className="h-2" aria-hidden />
              <div className="mb-1 h-px bg-border/60" />
            </div>
          </div>

          {/* Channels + Direct messages */}
          {isAuthenticated && starshipSlug && starshipData?.id && (
            <div className={isExpanded ? 'flex-1 min-h-0 flex flex-col pl-2 pr-1.5' : 'hidden'}>
              {/* Keep the sidebar itself non-scrollable; each section handles its own scroll */}
              <div className="flex-1 min-h-0 overflow-hidden pb-2">
                <ConversationList
                  starshipId={starshipData.id}
                  starshipSlug={activeStarshipSlug || undefined}
                  compact={true}
                  onNavigate={handleConversationSelect}
                  onConversationSelect={handleConversationSelect}
                />
              </div>
            </div>
          )}

          {/* Spacer to push content toward bottom when needed */}
          {(!isExpanded || !starshipData?.id) && <div className="flex-1 min-h-0"></div>}
          </div>
        </div>

        {/* Bottom bar: full width of sidebar (covers rail + column), content aligned with nav */}
        <div className="flex-shrink-0 w-full border-t border-border/60 bg-card pt-3 pb-4 px-3">
          <div className="flex flex-col gap-0 w-full">
            {isAuthenticated && starshipData?.id && canManageBilling ? (
              isExpanded ? (
                <button
                  type="button"
                  disabled={!activeStarshipSlug}
                  onClick={() => {
                    if (!activeStarshipSlug) return
                    router.push(`/ship/${activeStarshipSlug}/settings/billing`)
                  }}
                  className="h-7 w-full flex items-center gap-1.5 rounded-lg pl-2 pr-1 text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30] disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="View credits and billing"
                >
                  <span className="flex-1 text-left text-[11px] font-medium">Credits</span>
                  <div className="flex items-center gap-1">
                    <Icon name="coins" className="h-3 w-3" />
                    <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={true} inheritTextColor valueClassName="text-[10px]" />
                  </div>
                </button>
              ) : (
                <div className="flex justify-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!activeStarshipSlug}
                        onClick={() => {
                          if (!activeStarshipSlug) return
                          router.push(`/ship/${activeStarshipSlug}/settings/billing`)
                        }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-background/70 shadow-sm ring-1 ring-border/50 text-muted-foreground transition-all hover:bg-muted/70 dark:hover:bg-[#2C2C30] hover:text-foreground hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="View credits and billing"
                      >
                        <Icon name="coins" className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={10}
                      className="bg-card text-foreground border border-border/40 shadow-lg"
                    >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Credits</span>
                          <Icon name="coins" className="h-3 w-3" />
                          <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={true} inheritTextColor valueClassName="text-[10px]" />
                        </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )
            ) : null}

            <div className={isExpanded ? 'w-full' : 'flex justify-center'}>
              {isExpanded ? (
                <UserProfileMenu expanded />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <UserProfileMenu />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={10}
                    className="bg-card text-foreground border border-border/40 shadow-lg"
                  >
                    Account
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </motion.div>

    </>
  )
}
