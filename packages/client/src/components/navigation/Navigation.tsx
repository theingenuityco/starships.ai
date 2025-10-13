'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { UserProfile } from '@/components/auth/UserProfile'
import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { NavigationItem } from '@/components/navigation/NavigationItem'
import { ThemeToggle } from '@/components/theme-toggle'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'

import { AnimatePresence, motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

interface NavigationProps {
  isMobile?: boolean
}

// (All items are composed into a single NavigationSection below)

export function Navigation(props: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user, logout } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  // State for conversation list toggle
  const [showConversationList, setShowConversationList] = useState(false)
  // State for user subnav toggle
  const [showUserSubnav, setShowUserSubnav] = useState(false)
  // Smooth height animation: measure content height
  const [userSubnavHeight, setUserSubnavHeight] = useState(0)
  const userSubnavContentRef = useRef<HTMLDivElement>(null)
  // Smooth height animation (conversations)
  const [conversationSubnavHeight, setConversationSubnavHeight] = useState(0)
  const conversationSubnavContentRef = useRef<HTMLDivElement>(null)
  // State for logo animation trigger
  const [animationTrigger, setAnimationTrigger] = useState(0)
  // State for navigation starship slug
  const [navigationStarshipSlug, setNavigationStarshipSlug] = useState<string | null>(null)

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

  // Re-measure user subnav content when opened or on resize
  useEffect(() => {
    const measure = () => {
      const el = userSubnavContentRef.current
      if (!el) return
      setUserSubnavHeight(el.offsetHeight)
    }
    if (showUserSubnav) {
      measure()
      window.addEventListener('resize', measure)
    } else {
      setUserSubnavHeight(0)
    }
    return () => window.removeEventListener('resize', measure)
  }, [showUserSubnav])

  // Measure conversation subnav content height (declared after route flags below)

  // Check if we're on a conversation route
  const isConversationRoute = pathname.includes('/conversations')
  const isOverviewRoute = starshipSlug ? pathname === `/ship/${starshipSlug}` : false
  const isSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings`) : false
  const isUsageSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/usage`) : false
  const isEnvironmentSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/environment`) : false

  // Get starship data to access starship ID
  const { data: starshipData } = useStarshipBySlug(starshipSlug || '', !!starshipSlug)

  // Measure conversation subnav content height
  useEffect(() => {
    const measure = () => {
      const el = conversationSubnavContentRef.current
      if (!el) return
      setConversationSubnavHeight(el.offsetHeight)
    }
    if (isConversationRoute) {
      measure()
      window.addEventListener('resize', measure)
    } else {
      setConversationSubnavHeight(0)
    }
    return () => window.removeEventListener('resize', measure)
  }, [isConversationRoute])

  // Conversation action handlers
  const deleteConversationMutation = useDeleteConversation()
  const updateConversationStatusMutation = useUpdateConversationStatus()

  const handleConversationDelete = async (conversationId: string) => {
    try {
      await deleteConversationMutation.mutateAsync(conversationId)
    } catch (error) {
      // Error handling is done in the mutation hook
    }
  }

  const handleConversationArchive = async (conversationId: string) => {
    try {
      await updateConversationStatusMutation.mutateAsync({
        conversationId,
        status: 'archived',
      })
    } catch (error) {
      // Error handling is done in the mutation hook
    }
  }

  // Handle new conversation
  const handleNewConversation = () => {
    router.push(`/ship/${starshipSlug}/conversations`)
  }

  // Handle conversation history toggle
  const handleToggleConversationHistory = () => {
    setShowConversationList(!showConversationList)
  }

  // Handle conversation selection - hide history pane
  const handleConversationSelect = (conversationId: string) => {
    setShowConversationList(false)
  }

  // Build a single unified navigation section list
  const mainNavigationItems = [
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'rocket', isActive: isOverviewRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/conversations`, label: 'Conversations', icon: 'message-square', isActive: isConversationRoute }] : []),
    { href: `/marketplace`, label: 'Marketplace', icon: 'store', isActive: pathname === '/marketplace' },
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/settings/environment`, label: 'Environment', icon: 'key', isActive: isEnvironmentSettingsRoute }] : []),
  ]

  // Handle logo click - smart navigation based on context
  const handleLogoClick = () => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)

    if (starshipSlug) {
      // Go to overview if we have a starship
      router.push(`/ship/${starshipSlug}`)
    } else {
      // Go to marketplace as default for authenticated users without starships
      router.push('/marketplace')
    }
  }

  // Floating mode - expandable layout
  return (
    <div className="flex flex-row frosted-glass-card rounded-2xl overflow-hidden shadow-frosted-lg transition-all duration-300 ease-in-out">
      <div
        className="flex flex-col items-center justify-center w-16 flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        }}
      >
        {/* Compact Header with Theme Toggle */}
        <div className="px-3 py-5 border-b border-border/20 flex-shrink-0 flex items-center justify-center">
          <div className="cursor-pointer hover:scale-105 transform transition-transform text-muted-foreground hover:text-foreground" onClick={handleLogoClick} title="Navigate to Overview">
            <StarshipsLogo
              width={42}
              height={42}
              className=""
              gradientId="nav-gradient"
              animationDelay={1}
              repeatDelay={20}
              triggerAnimation={animationTrigger}
              idleLoop={false}
              playOnMountOnce={true}
            />
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
          <div className="p-3 space-y-4">
            <NavigationSection
              title="Navigation"
              items={mainNavigationItems}
              pathname={pathname}
              renderAfter={item => {
                const isConversations = isAuthenticated && starshipSlug && item.href === `/ship/${starshipSlug}/conversations`
                if (!isConversations) return null

                return (
                  isConversationRoute && (
                    <motion.div
                      initial={false}
                      animate={{ height: isConversationRoute ? conversationSubnavHeight : 0, opacity: isConversationRoute ? 1 : 0, y: isConversationRoute ? 0 : 4 }}
                      transition={{ duration: 0.24, ease: 'easeInOut' }}
                      className="rounded-bl-xl rounded-br-xl mx-1.5 overflow-hidden -mt-2 bg-muted/40"
                      style={{ willChange: 'height, opacity, transform' }}
                    >
                      <div ref={conversationSubnavContentRef} className="pt-4 pb-2 px-2 flex flex-col items-center space-y-1.5">
                        {/* New Conversation Icon */}
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={handleNewConversation}
                              className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-9 h-9 border border-transparent text-muted-foreground hover:text-foreground hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                            >
                              <LordIcon src={getLordiconUrl('plus')} width={22} height={22} className="w-[22px] h-[22px]" trigger="hover" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                            New Conversation
                          </TooltipContent>
                        </Tooltip>

                        {/* Conversation History Toggle Icon */}
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={handleToggleConversationHistory}
                              className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-9 h-9 border border-transparent text-muted-foreground hover:text-foreground hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                            >
                              {showConversationList ? (
                                <LordIcon src={getLordiconUrl('x')} width={22} height={22} className="w-[22px] h-[22px]" trigger="hover" />
                              ) : (
                                <LordIcon src={getLordiconUrl('history')} width={22} height={22} className="w-[22px] h-[22px]" trigger="hover" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                            {showConversationList ? 'Hide' : 'Show'} History
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </motion.div>
                  )
                )
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <ThemeToggle />
        </div>
        {/* User Profile Section - Collapsed Mode with upward subnav */}
        <div className="border-t border-border/20 flex-shrink-0 p-2 flex flex-col items-center justify-center relative">
          {/* Upward subnav - renders ABOVE the user icon */}
          <motion.div
            initial={false}
            animate={{ height: userSubnavHeight, opacity: showUserSubnav ? 1 : 0, y: showUserSubnav ? 0 : 4 }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            className="rounded-tl-xl rounded-tr-xl mx-1.5 overflow-hidden mb-2 bg-muted/40"
            style={{ willChange: 'height, opacity, transform' }}
          >
            <div ref={userSubnavContentRef} className="pt-2 pb-2 px-2 flex flex-col items-center space-y-1.5">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={() => {
                      if (!starshipSlug) return
                      router.push(`/ship/${starshipSlug}/settings/usage`)
                      setShowUserSubnav(false)
                    }}
                    className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-9 h-9 border border-transparent text-muted-foreground hover:text-foreground hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <LordIcon src={getLordiconUrl('settings')} width={22} height={22} className="w-[22px] h-[22px]" trigger="click" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                  Settings
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={async () => {
                      try {
                        await logout()
                      } finally {
                        router.push('/')
                      }
                    }}
                    className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-9 h-9 border border-transparent text-destructive hover:text-destructive hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <LordIcon src={getLordiconUrl('x')} width={22} height={22} className="w-[22px] h-[22px]" trigger="click" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                  Sign out
                </TooltipContent>
              </Tooltip>
            </div>
          </motion.div>
          {/* Profile icon (click to toggle) */}
          <UserProfile
            mode="collapsed"
            onClick={() => {
              setShowConversationList(false)
              setShowUserSubnav(prev => !prev)
            }}
          />
        </div>
      </div>

      {/* Right Side - Conversation List (conditionally rendered) */}
      <AnimatePresence>
        {showConversationList && starshipData?.id && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'min(320px, calc(100vw - 8rem))', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="border-l border-border/20 overflow-hidden"
          >
            <ConversationList
              starshipId={starshipData.id}
              onConversationDelete={handleConversationDelete}
              onConversationArchive={handleConversationArchive}
              onConversationSelect={handleConversationSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
