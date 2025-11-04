'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'
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
}

// (All items are composed into a single NavigationSection below)

export function Navigation(props: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user, userName } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  // State for navbar hover expansion
  const [isHovered, setIsHovered] = useState(false)
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
        isEnvironmentSettingsRoute: false,
        isAgentsRoute: false,
        isAgentBuilderRoute: false,
        isToolsRoute: false,
        isToolBuilderRoute: false,
      }
    }
    return {
      isOverviewRoute: pathname === `/ship/${starshipSlug}`,
      isSettingsRoute: pathname.startsWith(`/ship/${starshipSlug}/settings`),
      isEnvironmentSettingsRoute: pathname.startsWith(`/ship/${starshipSlug}/settings/environment`),
      isAgentsRoute: pathname.startsWith(`/ship/${starshipSlug}/agents`),
      isAgentBuilderRoute: pathname.startsWith(`/ship/${starshipSlug}/agent/`),
      isToolsRoute: pathname.startsWith(`/ship/${starshipSlug}/tools`),
      isToolBuilderRoute: pathname.startsWith(`/ship/${starshipSlug}/tool/`),
    }
  }, [pathname, starshipSlug])

  const { isOverviewRoute, isSettingsRoute, isEnvironmentSettingsRoute, isAgentsRoute, isAgentBuilderRoute, isToolsRoute, isToolBuilderRoute } = routeChecks

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
  }, [router, starshipSlug])

  // Handle conversation selection - memoized
  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      if (!starshipSlug) return
      router.push(`/ship/${starshipSlug}/conversations/${conversationId}`)
    },
    [router, starshipSlug]
  )

  // Handle user profile click - memoized
  const handleUserProfileClick = useCallback(() => {
    if (!starshipSlug) return
    router.push(`/ship/${starshipSlug}/settings`)
  }, [router, starshipSlug])

  // Handle logo click - memoized
  const handleLogoClick = useCallback(() => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
    // Always go to landing screen
    router.push('/')
  }, [router])

  // Memoize hover handlers to prevent unnecessary re-renders
  const handleMouseEnter = useCallback(() => setIsHovered(true), [])
  const handleMouseLeave = useCallback(() => setIsHovered(false), [])

  // Handle recents click - show tooltip only, navigation handled by expansion
  const handleRecentsClick = useCallback(() => {
    // No action needed - just shows tooltip in collapsed state
  }, [])

  // Memoize main navigation items - only recalculate when dependencies change
  // Include Recents in the same hierarchy when collapsed
  const mainNavigationItems = useMemo(
    () => [
      ...(isAuthenticated && starshipSlug ? [{ href: '#', label: 'New Chat', icon: 'plus', isActive: false, onClick: handleNewConversation, special: true }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'overview', isActive: isOverviewRoute }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/agents`, label: 'Agents', icon: 'agents', isActive: isAgentsRoute || isAgentBuilderRoute }] : []),
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/tools`, label: 'Tools', icon: 'tools', isActive: isToolsRoute || isToolBuilderRoute }] : []),
      { href: `/marketplace`, label: 'Marketplace', icon: 'hub', isActive: pathname === '/marketplace' },
      ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/settings/environment`, label: 'Environment', icon: 'key', isActive: isEnvironmentSettingsRoute }] : []),
      // Add Recents to same hierarchy when collapsed - it will be hidden when expanded via conditional rendering
      ...(isAuthenticated && starshipSlug && starshipData?.id && !isHovered ? [{ href: '#', label: 'Recents', icon: '', isActive: false, onClick: handleRecentsClick }] : []),
    ],
    [
      isAuthenticated,
      starshipSlug,
      isOverviewRoute,
      isAgentsRoute,
      isAgentBuilderRoute,
      isToolsRoute,
      isToolBuilderRoute,
      pathname,
      isEnvironmentSettingsRoute,
      handleNewConversation,
      handleRecentsClick,
      isHovered,
      starshipData?.id,
    ]
  )

  // Floating mode - expandable layout
  return (
    <div
      ref={sidebarRef}
      className="flex flex-row frosted-glass-card rounded-2xl overflow-hidden shadow-frosted-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ willChange: 'width' }}
    >
      <div
        className="flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          width: isHovered ? '16rem' : '3.5rem',
          height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding from layout
          willChange: 'width',
          contain: 'layout style paint',
        }}
      >
        {/* Compact Header with Theme Toggle */}
        <div className="px-3 py-3 border-b border-border/20 flex-shrink-0 flex items-center justify-between gap-3 bg-muted/60">
          <div className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center justify-start gap-3" onClick={handleLogoClick} title="Go to Landing Screen">
            <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
              <StarshipsLogo
                width={36}
                height={36}
                className="opacity-70"
                gradientId="nav-gradient"
                animationDelay={1}
                repeatDelay={20}
                triggerAnimation={animationTrigger}
                idleLoop={false}
                playOnMountOnce={false}
              />
            </div>
            {isHovered && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={`${orbitron.className} text-lg font-normal tracking-tight leading-none whitespace-nowrap`}
              >
                starships.ai
              </motion.span>
            )}
          </div>
          <div className="flex-shrink-0">
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation Content - Moved to top */}
        <div
          className="flex-shrink-0"
          style={{ marginTop: '0.25rem', marginBottom: '0.75rem', paddingTop: '0.75rem', paddingBottom: isAuthenticated && starshipSlug && starshipData?.id && isHovered ? '0' : '0.75rem' }}
        >
          <div className="flex flex-col space-y-1 w-full">
            <NavigationSection title="Navigation" items={mainNavigationItems} pathname={pathname} expanded={isHovered} />
          </div>
        </div>

        {/* Conversation History List - Recents - Show when navbar is expanded */}
        {isAuthenticated && starshipSlug && isHovered && starshipData?.id && (
          <div ref={conversationHistoryRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Divider above Recents */}
            <div className="w-full border-t border-border/40 my-2"></div>

            {/* Recents header - matches NavigationItem exactly with space-y-1 gap (0.25rem) */}
            <div className="w-full">
              <div
                className="w-full rounded-xl flex items-center border border-transparent text-muted-foreground"
                style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem', paddingLeft: '0.75rem', paddingRight: '0.75rem', justifyContent: 'flex-start' }}
              >
                <div className="flex-shrink-0" style={{ width: '1rem', height: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, marginRight: '0.60rem' }}>
                  <LordIcon src={getLordiconUrl('history')} width={16} height={16} className="w-4 h-4" trigger="hover" />
                </div>
                <span className="text-xs font-medium">Recents</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-3 pb-3 space-y-1">
                <ConversationList starshipId={starshipData.id} onConversationDelete={handleConversationDelete} onConversationSelect={handleConversationSelect} compact={true} />
              </div>
            </div>
          </div>
        )}

        {/* Spacer to push user profile to bottom */}
        {(!isHovered || !starshipData?.id) && <div className="flex-1 min-h-0"></div>}

        {/* User Profile Section */}
        <div ref={userSectionRef} className="flex-shrink-0 flex flex-col items-center justify-center relative" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          {/* Profile section */}
          <div className="w-full" style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem' }}>
            {isHovered ? (
              <div
                className="flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group w-full"
                onClick={handleUserProfileClick}
                style={{ justifyContent: 'flex-start', paddingTop: '0.5rem', paddingBottom: '0.5rem', minHeight: '2.5rem' }}
              >
                <div className="flex-shrink-0" style={{ width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', margin: 0 }}>
                  <UserProfile mode="collapsed" active={isSettingsRoute} onClick={handleUserProfileClick} />
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
                        <StarshipsLogo width={12} height={12} className="opacity-70 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">{starshipData.name || 'Starship'}</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  {isHovered && (
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}>
                      <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center w-full" style={{ justifyContent: 'flex-start', minHeight: '2.5rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                <div className="flex-shrink-0" style={{ width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', margin: 0 }}>
                  <UserProfile mode="collapsed" active={isSettingsRoute} onClick={handleUserProfileClick} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
