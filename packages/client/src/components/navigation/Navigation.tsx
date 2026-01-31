'use client'

import Icon from '@/components/primitives/Icon'

import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { NavigationItem } from '@/components/navigation/NavigationItem'
import { StarshipRail } from '@/components/navigation/StarshipRail'
import { UserProfileMenu } from '@/components/auth/UserProfileMenu'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NavigationOnboardingTour } from '@/components/onboarding/NavigationOnboardingTour'
import BalanceStatusIndicator from '@/components/billing/BalanceStatusIndicator'
import { useStarshipBySlug, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'
import { useWallet } from '@/hooks/useWallet'

import { AnimatePresence, motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface NavigationProps {
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

// (All items are composed into a single NavigationSection below)

export function Navigation(props: NavigationProps) {
  const { isMobile = false, isOpen = true, onClose } = props
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user, userName, isInstanceAdmin } = useAuth()
  const { getSelectedStarshipId, setSelectedStarship } = useSelectedStarship()
  const { currentStepInfo } = useNavigationOnboardingContext()

  // Navbar expansion state (GPT-style: expanded by default, collapsible)
  // On mobile, always expanded (no collapse functionality)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isCollapsing, setIsCollapsing] = useState(false)

  // Force expanded state on mobile
  useEffect(() => {
    if (isMobile) {
      setIsExpanded(true)
    }
  }, [isMobile])
  // State for logo animation trigger
  const [animationTrigger, setAnimationTrigger] = useState(0)
  // State for navigation starship slug
  const [navigationStarshipSlug, setNavigationStarshipSlug] = useState<string | null>(null)
  // Ref for click outside detection
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Ref for collapse timeout to keep logo stable during collapse animation
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup collapse timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current)
      }
    }
  }, [])

  // Get user starships to find a default starship
  const { data: userStarships } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)

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
      // If we're not on a starship route, try to get a default starship
      const selectedStarshipId = getSelectedStarshipId()
      if (selectedStarshipId && userStarships) {
        const selectedStarship = userStarships.find(ship => ship.id === selectedStarshipId)
        if (selectedStarship) {
          setNavigationStarshipSlug(selectedStarship.slug)
          return
        }
      }

      // Fall back to the first available starship
      if (userStarships && userStarships.length > 0) {
        setNavigationStarshipSlug(userStarships[0].slug)
      } else {
        setNavigationStarshipSlug(null)
      }
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
      if (p.includes('/conversations/') || p.includes('/channels/')) {
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
        isConnectorsRoute: false,
        isAgentsRoute: false,
        isAgentBuilderRoute: false,
        isSchedulesRoute: false,
      }
    }
    return {
      isConnectorsRoute: pathname.startsWith(`/ship/${starshipSlug}/connectors`),
      isAgentsRoute: pathname.startsWith(`/ship/${starshipSlug}/agents`),
      isAgentBuilderRoute: pathname.startsWith(`/ship/${starshipSlug}/agent/`),
      isSchedulesRoute: pathname.startsWith(`/ship/${starshipSlug}/schedules`),
    }
  }, [pathname, starshipSlug])

  const { isConnectorsRoute, isAgentsRoute, isAgentBuilderRoute, isSchedulesRoute } = routeChecks

  // Get starship data to access starship ID - only fetch when needed
  const { data: starshipData } = useStarshipBySlug(starshipSlug || '', !!starshipSlug && isAuthenticated)

  const canManageBilling = Boolean(isAuthenticated && user?.id && starshipData?.id && (isInstanceAdmin === true || starshipData.ownerId === user.id))

  const { data: wallet, isLoading: walletLoading } = useWallet(starshipData?.id ?? '', Boolean(canManageBilling && starshipData?.id))

  // Handle logo click - memoized
  const handleLogoClick = useCallback(() => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
    // Always go to landing screen
    router.push('/')
  }, [router])

  // Header click: expand when collapsed, otherwise go to landing
  const handleHeaderClick = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true)
      return
    }
    handleLogoClick()
  }, [isExpanded, handleLogoClick])

  // Create refs for navigation items (for onboarding positioning)
  const exploreAgentsRef = useRef<HTMLDivElement>(null)
  const myAgentsRef = useRef<HTMLDivElement>(null)
  const connectorsRef = useRef<HTMLDivElement>(null)
  const schedulesRef = useRef<HTMLDivElement>(null)
  const channelsRef = useRef<HTMLDivElement>(null)
  const directMessagesRef = useRef<HTMLDivElement>(null)

  const navigationItemRefs = useMemo(() => {
    const refs = new Map<string, React.RefObject<HTMLDivElement | null>>()
    refs.set('Explore Agents', exploreAgentsRef)
    refs.set('My Agents', myAgentsRef)
    refs.set('Connectors', connectorsRef)
    refs.set('Schedules', schedulesRef)
    refs.set('Channels', channelsRef)
    refs.set('Direct messages', directMessagesRef)
    return refs
  }, [])

  // Determine which navigation item should be highlighted during onboarding
  const getOnboardingHighlight = useCallback(
    (label: string): boolean => {
      if (!currentStepInfo) return false
      // Match the label exactly
      const shouldHighlight = currentStepInfo.label === label
      return shouldHighlight
    },
    [currentStepInfo]
  )

  // Memoize main navigation items - only recalculate when dependencies change
  // Include Recents in the same hierarchy when collapsed
  const mainNavigationItems = useMemo(
    () => [
      {
        href: `/marketplace`,
        label: 'Explore Agents',
        icon: 'store',
        isActive: pathname === '/marketplace',
        itemRef: exploreAgentsRef,
        isOnboardingHighlighted: getOnboardingHighlight('Explore Agents'),
      },
      ...(isAuthenticated && starshipSlug
        ? [
            {
              href: `/ship/${starshipSlug}/agents`,
              label: 'My Agents',
              icon: 'bot',
              isActive: isAgentsRoute || isAgentBuilderRoute,
              itemRef: myAgentsRef,
              isOnboardingHighlighted: getOnboardingHighlight('My Agents'),
            },
          ]
        : []),
      ...(isAuthenticated && starshipSlug
        ? [
            {
              href: `/ship/${starshipSlug}/connectors`,
              label: 'Connectors',
              icon: 'plug',
              isActive: isConnectorsRoute,
              itemRef: connectorsRef,
              isOnboardingHighlighted: getOnboardingHighlight('Connectors'),
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
              itemRef: schedulesRef,
              isOnboardingHighlighted: getOnboardingHighlight('Schedules'),
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
    [isAuthenticated, starshipSlug, isAgentsRoute, isAgentBuilderRoute, pathname, isSchedulesRoute, isConnectorsRoute, starshipData?.id, isInstanceAdmin, getOnboardingHighlight]
  )

  const handleSidebarBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isExpanded) return
      // If click originated from a button/link/interactive element, ignore
      const target = e.target as HTMLElement
      if (target.closest('button, a, [role="button"], input, label')) {
        return
      }
      setIsExpanded(true)
    },
    [isExpanded]
  )

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isMobile && isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-40" style={{ backdropFilter: 'blur(2px)' }} />
      )}

      {/* Navigation sidebar */}
      <motion.div
        ref={sidebarRef}
        data-navigation-sidebar
        initial={isMobile ? { x: '-100%' } : false}
        animate={isMobile ? { x: isOpen ? 0 : '-100%' } : {}}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={`flex flex-row h-full overflow-hidden border-r border-border/60 bg-card ${isMobile ? 'fixed left-0 top-0 z-50' : 'transition-all duration-300 ease-in-out'}`}
        style={{ willChange: isMobile ? 'transform' : 'width', cursor: !isMobile && !isExpanded ? 'e-resize' : 'auto' }}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
        onClick={handleSidebarBackgroundClick}
      >
        {/* Discord-style starship rail */}
        {isAuthenticated ? <StarshipRail starships={userStarships ?? []} activeSlug={activeStarshipSlug} onSelect={handleStarshipSelect as any} onCreate={() => router.push('/profile')} /> : null}

        <div
          className="flex flex-col pb-3 transition-all duration-300 ease-in-out"
          style={{
            width: isExpanded ? '16rem' : '3.5rem',
            height: '100%',
            willChange: 'width',
            contain: 'layout style paint',
          }}
        >
          {/* Header – logo, brand, and collapse toggle */}
          <div className="px-2 pt-3 pb-2 flex-shrink-0 flex items-center justify-between gap-2">
            <div
              className="text-muted-foreground hover:text-foreground flex items-center justify-start gap-0 rounded-lg px-2 py-1 hover:bg-muted/40 transition-colors"
              onClick={isMobile ? undefined : handleHeaderClick}
              title={isMobile ? undefined : isExpanded ? 'Go to Landing Screen' : 'Expand sidebar'}
              style={{ cursor: isMobile ? 'default' : 'pointer' }}
            >
              {/* Match the nav icon column width so the logo aligns with item icons */}
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '1.5rem', height: '1.5rem' }}>
                {isExpanded || isCollapsing || !isHovered ? (
                  <StarshipsLogo
                    width={22}
                    height={22}
                    className=""
                    gradientId="nav-gradient"
                    animationDelay={1}
                    repeatDelay={20}
                    triggerAnimation={animationTrigger}
                    idleLoop={false}
                    playOnMountOnce={false}
                  />
                ) : (
                  <Icon name="sidebar" className="w-5 h-5" />
                )}
              </div>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="text-[15px] font-medium tracking-tight leading-snug whitespace-nowrap max-w-[11.5rem] truncate"
                  style={{ marginLeft: '0.375rem' }}
                >
                  {starshipData?.name || 'Starships.ai'}
                </motion.span>
              )}
            </div>
            {/* Close button for mobile, collapse button for desktop */}
            {isMobile && isExpanded && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Close sidebar"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            ) : (
              isExpanded &&
              !isMobile && (
                <button
                  type="button"
                  onClick={() => {
                    // Start collapsing: keep logo visible during animation
                    setIsCollapsing(true)
                    setIsExpanded(false)

                    if (collapseTimeoutRef.current) {
                      clearTimeout(collapseTimeoutRef.current)
                    }

                    // Match the CSS transition duration (300ms)
                    collapseTimeoutRef.current = setTimeout(() => {
                      setIsCollapsing(false)
                    }, 300)
                  }}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Collapse sidebar"
                  style={{ cursor: 'w-resize' }}
                >
                  <Icon name="sidebar" className="w-5 h-5" />
                </button>
              )
            )}
          </div>

          {/* Navigation Content - directly under header */}
          <div
            className="flex-shrink-0"
            style={{
              marginTop: '0rem',
              marginBottom: '0.5rem',
              paddingTop: '0rem',
              paddingBottom: isAuthenticated && starshipSlug && starshipData?.id && isExpanded ? '0' : '0.5rem',
            }}
          >
            <div className="flex flex-col space-y-0 w-full px-2">
              <NavigationSection title="Navigation" items={mainNavigationItems} pathname={pathname} expanded={isExpanded} onItemClick={isMobile && onClose ? onClose : undefined} />
            </div>
          </div>

          {/* Channels + Direct messages */}
          {isExpanded && isAuthenticated && starshipSlug && starshipData?.id && (
            <div className="flex-1 min-h-0 flex flex-col px-2">
              {/* Keep the sidebar itself non-scrollable; each section handles its own scroll */}
              <div className="flex-1 min-h-0 overflow-hidden pb-2">
                <ConversationList
                  starshipId={starshipData.id}
                  compact={true}
                  onboardingChannelsAnchorRef={channelsRef}
                  onboardingDirectMessagesAnchorRef={directMessagesRef}
                  onboardingHighlight={
                    currentStepInfo?.label === 'Channels' ? 'channels' : currentStepInfo?.label === 'Direct messages' ? 'directMessages' : null
                  }
                  onConversationSelect={() => {
                    if (isMobile && onClose) onClose()
                  }}
                />
              </div>
            </div>
          )}

          {/* Spacer to push content toward bottom when needed */}
          {(!isExpanded || !starshipData?.id) && <div className="flex-1 min-h-0"></div>}

          {/* Bottom controls */}
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="flex flex-col gap-1">
              {isAuthenticated && starshipData?.id ? (
                isExpanded ? (
                  <button
                    type="button"
                    disabled={!canManageBilling || !activeStarshipSlug}
                    onClick={() => {
                      if (!activeStarshipSlug) return
                      router.push(`/ship/${activeStarshipSlug}/settings/billing`)
                    }}
                    className="h-9 w-full flex items-center gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="View credits and billing"
                  >
                    <span className="flex-1 text-left text-[13px] font-medium">Credits</span>
                    <div className="flex items-center gap-1.5">
                      <Icon name="coins" className="h-3.5 w-3.5" />
                      <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={true} inheritTextColor valueClassName="text-[12px]" />
                    </div>
                  </button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!canManageBilling || !activeStarshipSlug}
                        onClick={() => {
                          if (!activeStarshipSlug) return
                          router.push(`/ship/${activeStarshipSlug}/settings/billing`)
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-background/70 shadow-sm ring-1 ring-border/50 text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="View credits and billing"
                      >
                        <Icon name="coins" className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Credits</span>
                        <Icon name="coins" className="h-3.5 w-3.5" />
                        <BalanceStatusIndicator wallet={wallet} isLoading={walletLoading} variant="minimal" showDot={false} showUnit={true} inheritTextColor valueClassName="text-[12px]" />
                      </div>
                    </TooltipContent>
                  </Tooltip>
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
                    <TooltipContent side="right">Account</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* Profile lives in bottom controls */}
        </div>
      </motion.div>

      {/* Navigation Onboarding Tour */}
      {isAuthenticated && starshipSlug && <NavigationOnboardingTour starshipSlug={starshipSlug} navigationItemRefs={navigationItemRefs} />}
    </>
  )
}
