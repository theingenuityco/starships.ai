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
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
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

  // Check if we're on a conversation route
  const isConversationRoute = pathname.includes('/conversations')
  const isOverviewRoute = starshipSlug ? pathname === `/ship/${starshipSlug}` : false
  const isSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings`) : false
  const isUsageSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/usage`) : false
  const isEnvironmentSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/environment`) : false
  const isAgentsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agents`) : false
  const isAgentBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agent/`) : false
  const isToolsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tools`) : false
  const isToolBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tool/`) : false

  // Get starship data to access starship ID
  const { data: starshipData } = useStarshipBySlug(starshipSlug || '', !!starshipSlug)


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

  // Handle conversation selection - navigate to conversation
  const handleConversationSelect = (conversationId: string) => {
    router.push(`/ship/${starshipSlug}/conversations/${conversationId}`)
  }

  // Handle user profile click - navigate to settings
  const handleUserProfileClick = () => {
    if (!starshipSlug) return
    router.push(`/ship/${starshipSlug}/settings`)
  }


  // Handle logo click - navigate to landing screen
  const handleLogoClick = () => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
    
    // Always go to landing screen
    router.push('/')
  }

  // Memoize hover handlers to prevent unnecessary re-renders
  const handleMouseEnter = useCallback(() => setIsHovered(true), [])
  const handleMouseLeave = useCallback(() => setIsHovered(false), [])

  // Memoize main navigation items
  const mainNavigationItems = useMemo(() => [
    ...(isAuthenticated && starshipSlug ? [{ href: '#', label: 'New Chat', icon: 'plus', isActive: false, onClick: handleNewConversation, special: true }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'overview', isActive: isOverviewRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/agents`, label: 'Agents', icon: 'agents', isActive: isAgentsRoute || isAgentBuilderRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/tools`, label: 'Tools', icon: 'tools', isActive: isToolsRoute || isToolBuilderRoute }] : []),
    { href: `/marketplace`, label: 'Marketplace', icon: 'hub', isActive: pathname === '/marketplace' },
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/settings/environment`, label: 'Environment', icon: 'key', isActive: isEnvironmentSettingsRoute }] : []),
  ], [isAuthenticated, starshipSlug, isOverviewRoute, isAgentsRoute, isAgentBuilderRoute, isToolsRoute, isToolBuilderRoute, pathname, isEnvironmentSettingsRoute, handleNewConversation])

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
        }}
      >
        {/* Compact Header with Theme Toggle */}
        <div className="px-3 py-5 border-b border-border/20 flex-shrink-0 flex items-center justify-start gap-3 bg-muted/30">
          <div className="cursor-pointer hover:scale-105 transform transition-transform text-muted-foreground hover:text-foreground flex-shrink-0 w-9 h-9 flex items-center justify-center" onClick={handleLogoClick} title="Go to Landing Screen">
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

        {/* Navigation Content - Moved to top */}
        <div className="flex-shrink-0 py-3">
          <div className="flex flex-col space-y-1 w-full">
            <NavigationSection
              title="Navigation"
              items={mainNavigationItems}
              pathname={pathname}
              expanded={isHovered}
            />
          </div>
        </div>

        {/* Recents Icon - Always visible in collapsed state */}
        {isAuthenticated && starshipSlug && starshipData?.id && !isHovered && (
          <div className="flex-shrink-0 py-2 flex items-center" style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem', justifyContent: 'flex-start' }}>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="w-full h-10 flex items-center cursor-pointer rounded-xl border border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md transition-all duration-300">
                  <LordIcon src={getLordiconUrl('history')} width={24} height={24} className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                Recents
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Conversation History List - Recents - Show when navbar is expanded */}
        {isAuthenticated && starshipSlug && isHovered && starshipData?.id && (
          <div 
            ref={conversationHistoryRef}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <LordIcon src={getLordiconUrl('history')} width={16} height={16} className="w-4 h-4 flex-shrink-0" />
                <span>Recents</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-3 pb-3 space-y-1">
                <ConversationList
                  starshipId={starshipData.id}
                  onConversationDelete={handleConversationDelete}
                  onConversationArchive={handleConversationArchive}
                  onConversationSelect={handleConversationSelect}
                  compact={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Spacer to push user profile to bottom */}
        {(!isHovered || !starshipData?.id) && <div className="flex-1 min-h-0"></div>}

        {/* User Profile Section */}
        <div ref={userSectionRef} className="flex-shrink-0 py-2 flex flex-col items-center justify-center relative">
          {/* Profile section */}
          <div className="w-full" style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem' }}>
            {isHovered ? (
              <div 
                className="flex items-center gap-3 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group w-full" 
                onClick={handleUserProfileClick}
                style={{ justifyContent: 'flex-start' }}
              >
                <div className="flex-shrink-0">
                  <UserProfile
                    mode="collapsed"
                    active={isSettingsRoute}
                    onClick={handleUserProfileClick}
                  />
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
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center w-full" style={{ justifyContent: 'flex-start' }}>
                <UserProfile
                  mode="collapsed"
                  active={isSettingsRoute}
                  onClick={handleUserProfileClick}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
