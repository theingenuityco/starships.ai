'use client'

import Icon from '@/components/primitives/Icon'

import { UserProfile } from '@/components/auth/UserProfile'
import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { NavigationItem } from '@/components/navigation/NavigationItem'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { useDeleteConversation } from '@/hooks/useConversations'
import { useStarshipBySlug, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'

import { AnimatePresence, motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Orbitron } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

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
  const { isAuthenticated, user, userName } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

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
  // Ref for conversation history container
  const conversationHistoryRef = useRef<HTMLDivElement>(null)
  // Ref for user section
  const userSectionRef = useRef<HTMLDivElement>(null)

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

  // Memoize route checks to prevent unnecessary recalculations
  const routeChecks = useMemo(() => {
    if (!starshipSlug) {
      return {
        isOverviewRoute: false,
        isSettingsRoute: false,
        isConnectorsRoute: false,
        isAgentsRoute: false,
        isAgentBuilderRoute: false,
        isToolsRoute: false,
        isToolBuilderRoute: false,
      }
    }
    return {
      isOverviewRoute: pathname === `/ship/${starshipSlug}`,
      isSettingsRoute: pathname.startsWith(`/ship/${starshipSlug}/settings`),
      isConnectorsRoute: pathname.startsWith(`/ship/${starshipSlug}/connectors`),
      isAgentsRoute: pathname.startsWith(`/ship/${starshipSlug}/agents`),
      isAgentBuilderRoute: pathname.startsWith(`/ship/${starshipSlug}/agent/`),
      isToolsRoute: pathname.startsWith(`/ship/${starshipSlug}/tools`),
      isToolBuilderRoute: pathname.startsWith(`/ship/${starshipSlug}/tool/`),
    }
  }, [pathname, starshipSlug])

  const { isOverviewRoute, isSettingsRoute, isConnectorsRoute, isAgentsRoute, isAgentBuilderRoute, isToolsRoute, isToolBuilderRoute } = routeChecks

  // Get starship data to access starship ID - only fetch when needed
  const { data: starshipData } = useStarshipBySlug(starshipSlug || '', !!starshipSlug && isAuthenticated)

  // Conversation action handlers - memoized to prevent unnecessary re-renders
  const deleteConversationMutation = useDeleteConversation()

  // Extract current conversation ID from pathname
  const currentConversationId = useMemo(() => {
    if (pathname.startsWith('/ship/')) {
      const pathParts = pathname.split('/')
      // Check if path matches /ship/<slug>/conversations/<conversationId>
      if (pathParts.length >= 5 && pathParts[3] === 'conversations' && pathParts[4]) {
        return pathParts[4]
      }
    }
    return null
  }, [pathname])

  const handleConversationDelete = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationMutation.mutateAsync(conversationId)

        // If we're currently viewing the deleted conversation, redirect to conversations page
        if (currentConversationId === conversationId && starshipSlug) {
          router.push(`/ship/${starshipSlug}/conversations`)
        }
      } catch (error) {
        // Error handling is done in the mutation hook
      }
    },
    [deleteConversationMutation, currentConversationId, starshipSlug, router]
  )

  // Handle new conversation - memoized
  const handleNewConversation = useCallback(() => {
    if (!starshipSlug) return
    router.push(`/ship/${starshipSlug}/conversations`)
    if (isMobile && onClose) onClose()
  }, [router, starshipSlug, isMobile, onClose])

  // Handle conversation selection - memoized
  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      if (!starshipSlug) return
      router.push(`/ship/${starshipSlug}/conversations/${conversationId}`)
      if (isMobile && onClose) onClose()
    },
    [router, starshipSlug, isMobile, onClose]
  )

  // Handle user profile click - memoized
  const handleUserProfileClick = useCallback(() => {
    if (!starshipSlug) return
    router.push(`/ship/${starshipSlug}/settings`)
    if (isMobile && onClose) onClose()
  }, [router, starshipSlug, isMobile, onClose])

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

  // Memoize main navigation items - only recalculate when dependencies change
  // Include Recents in the same hierarchy when collapsed
  const mainNavigationItems = useMemo(
    () => [
      ...(isAuthenticated && starshipSlug ? [{ href: '#', label: 'New Chat', icon: 'plus', isActive: false, onClick: handleNewConversation, special: true }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'rocket', isActive: isOverviewRoute }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/agents`, label: 'Agents', icon: 'head-circuit', isActive: isAgentsRoute || isAgentBuilderRoute }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/tools`, label: 'Tools', icon: 'wrench', isActive: isToolsRoute || isToolBuilderRoute }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/connectors`, label: 'Connectors', icon: 'plug', isActive: isConnectorsRoute }] : []),
      { href: `/marketplace`, label: 'Marketplace', icon: 'store', isActive: pathname === '/marketplace' },
    ],
    [isAuthenticated, starshipSlug, isOverviewRoute, isAgentsRoute, isAgentBuilderRoute, isToolsRoute, isToolBuilderRoute, pathname, isConnectorsRoute, handleNewConversation, starshipData?.id]
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
        initial={isMobile ? { x: '-100%' } : false}
        animate={isMobile ? { x: isOpen ? 0 : '-100%' } : {}}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={`flex flex-row h-full overflow-hidden border-r border-border/40 bg-card ${isMobile ? 'fixed left-0 top-0 z-50' : 'transition-all duration-300 ease-in-out'}`}
        style={{ willChange: isMobile ? 'transform' : 'width', cursor: !isMobile && !isExpanded ? 'e-resize' : 'auto' }}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
        onClick={handleSidebarBackgroundClick}
      >
        <div
          className="flex flex-col transition-all duration-300 ease-in-out"
          style={{
            width: isExpanded ? '16rem' : '3.5rem',
            height: '100%',
            willChange: 'width',
            contain: 'layout style paint',
          }}
        >
          {/* Header – logo, brand, and collapse toggle */}
          <div className="px-4 pt-5 pb-3 flex-shrink-0 flex items-center justify-between gap-2">
            <div
              className="text-muted-foreground hover:text-foreground flex items-center justify-start gap-0"
              onClick={isMobile ? undefined : handleHeaderClick}
              title={isMobile ? undefined : isExpanded ? 'Go to Landing Screen' : 'Expand sidebar'}
              style={{ cursor: isMobile ? 'default' : isExpanded ? 'w-resize' : 'e-resize' }}
            >
              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                {isExpanded || isCollapsing || !isHovered ? (
                  <StarshipsLogo
                    width={24}
                    height={24}
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
                  className={`${orbitron.className} text-sm font-medium tracking-tight leading-none whitespace-nowrap`}
                  style={{ marginLeft: '0.5rem' }}
                >
                  starships.ai
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
              marginBottom: '0.75rem',
              paddingTop: '0.25rem',
              paddingBottom: isAuthenticated && starshipSlug && starshipData?.id && isExpanded ? '0' : '0.75rem',
            }}
          >
            <div className="flex flex-col space-y-1 w-full px-2">
              <NavigationSection title="Navigation" items={mainNavigationItems} pathname={pathname} expanded={isExpanded} onItemClick={isMobile && onClose ? onClose : undefined} />
            </div>
          </div>

          {/* Conversation History List - Recents - only when expanded and data is available */}
          {isExpanded && isAuthenticated && starshipSlug && starshipData?.id && (
            <div ref={conversationHistoryRef} className="flex-1 min-h-0 flex flex-col px-2">
              {/* Divider above Recents - make more visible */}
              <div className="w-full border-t border-border my-3" />

              {/* Recents header - styled to match nav items (icon + label spacing) */}
              <div className="w-full">
                <div className="w-full rounded-lg flex items-center border border-transparent text-muted-foreground px-2 py-2" style={{ justifyContent: 'flex-start' }}>
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: '1.5rem',
                      height: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: 0,
                      marginRight: '0.5rem',
                    }}
                  >
                    <Icon name="history" className="w-5 h-5" />
                  </div>
                  <span className="text-[13px] font-medium">Recents</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="pb-3 space-y-1">
                  <ConversationList starshipId={starshipData.id} onConversationDelete={handleConversationDelete} onConversationSelect={handleConversationSelect} compact={true} />
                </div>
              </div>
            </div>
          )}

          {/* Spacer to push theme toggle + user profile toward bottom when needed */}
          {(!isExpanded || !starshipData?.id) && <div className="flex-1 min-h-0"></div>}

          {/* Theme toggle above profile section - styled like a nav item (expanded only) */}
          {isExpanded && (
            <div className="flex-shrink-0 px-2 pb-1">
              <div className="w-full rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center justify-between h-8 px-2 text-xs transition-colors">
                <span className="font-medium">Appearance</span>
                <ThemeToggle />
              </div>
            </div>
          )}

          {/* User Profile Section */}
          <div ref={userSectionRef} className="flex-shrink-0 flex flex-col items-center justify-center relative py-2">
            {/* Profile section */}
            <div className="w-full px-2">
              {isExpanded ? (
                <div
                  className="flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group w-full py-2 px-2"
                  onClick={handleUserProfileClick}
                  style={{ justifyContent: 'flex-start', minHeight: '2.5rem' }}
                >
                  <div className="flex-shrink-0 flex items-center justify-center">
                    <UserProfile mode="collapsed" active={isSettingsRoute} />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                      className="flex-1 min-w-0"
                    >
                      <p className="text-sm font-semibold truncate">{userName || user?.email || 'User'}</p>
                      {starshipData && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <StarshipsLogo width={12} height={12} className="flex-shrink-0" />
                          <p className="text-xs text-muted-foreground truncate">{starshipData.name || 'Starship'}</p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <AnimatePresence mode="wait">
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}>
                        <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center w-full px-2" style={{ justifyContent: 'flex-start', minHeight: '2.5rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                  <div className="flex-shrink-0 flex items-center justify-center">
                    <UserProfile mode="collapsed" active={isSettingsRoute} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
