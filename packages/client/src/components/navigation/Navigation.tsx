'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { UserProfile } from '@/components/auth/UserProfile'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useStarshipConversations } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'

import { motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

// (All items are composed into a single NavigationSection below)

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  // Navigation is always expanded like Claude - clean and simple
  const expanded = true
  const showLabels = false
  // Smooth height animation (overview submenu)
  const [overviewSubnavHeight, setOverviewSubnavHeight] = useState(0)
  const overviewSubnavContentRef = useRef<HTMLDivElement>(null)
  // State for logo animation trigger
  const [animationTrigger, setAnimationTrigger] = useState(0)
  // State for navigation starship slug
  const [navigationStarshipSlug, setNavigationStarshipSlug] = useState<string | null>(null)
  // Ref for click outside detection
  const sidebarRef = useRef<HTMLDivElement>(null)

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

  // Route checking for active states
  const isOverviewRoute = starshipSlug ? pathname === `/ship/${starshipSlug}` : false
  const isSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings`) : false
  const isEnvironmentSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/environment`) : false
  const isAgentsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agents`) : false
  const isAgentBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agent/`) : false
  const isToolsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tools`) : false
  const isToolBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tool/`) : false
  const overviewExpanded = isOverviewRoute || isAgentsRoute || isAgentBuilderRoute || isToolsRoute || isToolBuilderRoute


  // Measure overview subnav content height
  useEffect(() => {
    const measure = () => {
      const el = overviewSubnavContentRef.current
      if (!el) return
      setOverviewSubnavHeight(el.offsetHeight)
    }
    if (overviewExpanded) {
      requestAnimationFrame(measure)
      window.addEventListener('resize', measure)
    } else {
      setOverviewSubnavHeight(0)
    }
    return () => window.removeEventListener('resize', measure)
  }, [overviewExpanded])

  // Handle new conversation
  const handleNewConversation = () => {
    router.push(`/ship/${starshipSlug}/conversations`)
  }

  // Build a single unified navigation section list
  const mainNavigationItems = [
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'overview', isActive: isOverviewRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/conversations`, label: 'New Chat', icon: 'plus', isActive: false, onClick: handleNewConversation }] : []),
    { href: `/marketplace`, label: 'Marketplace', icon: 'hub', isActive: pathname === '/marketplace' },
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/settings/environment`, label: 'Environment', icon: 'key', isActive: isEnvironmentSettingsRoute }] : []),
  ]

  // Handle logo click - navigate to landing screen
  const handleLogoClick = () => {
    // Trigger animation
    setAnimationTrigger(prev => prev + 1)

    // Always go to landing screen
    router.push('/')
  }

  // Floating mode - expandable layout
  return (
    <div ref={sidebarRef} className="flex flex-row frosted-glass-card rounded-2xl overflow-hidden shadow-frosted-lg">
      <div
        className="flex flex-col flex-shrink-0 w-56"
        style={{
          height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        }}
      >
        {/* Header */}
        <div className="px-3 py-3 flex-shrink-0 flex items-center space-x-3 bg-black">
          <div className="cursor-pointer hover:scale-105 transform transition-transform" onClick={handleLogoClick} title="Go to Landing Screen">
            <StarshipsLogo
              width={20}
              height={20}
              className="text-white"
              gradientId="nav-gradient"
              animationDelay={1}
              repeatDelay={20}
              triggerAnimation={animationTrigger}
              idleLoop={false}
              playOnMountOnce={false}
            />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-medium text-white">starships.ai</h1>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 px-2 py-3 space-y-4">
            {/* Main Navigation */}
            <NavigationSection
              title="Navigation"
              items={mainNavigationItems}
              pathname={pathname}
              showLabels={showLabels}
              expanded={expanded}
              renderAfter={item => {
                const isOverviewItem = isAuthenticated && starshipSlug && item.href === `/ship/${starshipSlug}`
                if (isOverviewItem) {
                  return (
                    <motion.div
                      initial={false}
                      animate={{ height: overviewExpanded ? overviewSubnavHeight : 0, opacity: overviewExpanded ? 1 : 0, y: overviewExpanded ? 0 : 4 }}
                      transition={{ duration: 0.24, ease: 'easeInOut' }}
                      className="overflow-hidden mt-1 bg-muted/20 rounded-lg mx-3"
                      style={{ willChange: 'height, opacity, transform' }}
                    >
                      <div ref={overviewSubnavContentRef} className="px-3 py-2 space-y-1">
                        {/* Agents */}
                        <button
                          onClick={() => {
                            if (!starshipSlug) return
                            router.push(`/ship/${starshipSlug}/agents`)
                          }}
                          className={`group relative transition-all duration-300 rounded-lg flex items-center justify-start w-full px-3 py-2 h-10 border ${
                            isAgentsRoute || isAgentBuilderRoute
                              ? 'text-primary bg-gradient-to-r from-primary/20 to-primary/15 shadow-md border-primary/30'
                              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                          }`}
                        >
                          <LordIcon src={getLordiconUrl('agents')} width={20} height={20} className="w-[20px] h-[20px]" trigger="click" />
                          <span className="ml-3 text-sm font-medium">Agents</span>
                        </button>

                        {/* Tools */}
                        <button
                          onClick={() => {
                            if (!starshipSlug) return
                            router.push(`/ship/${starshipSlug}/tools`)
                          }}
                          className={`group relative transition-all duration-300 rounded-lg flex items-center justify-start w-full px-3 py-2 h-10 border ${
                            isToolsRoute || isToolBuilderRoute
                              ? 'text-primary bg-gradient-to-r from-primary/20 to-primary/15 shadow-md border-primary/30'
                              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                          }`}
                        >
                          <LordIcon src={getLordiconUrl('tools')} width={20} height={20} className="w-[20px] h-[20px]" trigger="click" />
                          <span className="ml-3 text-sm font-medium">Tools</span>
                        </button>
                      </div>
                    </motion.div>
                  )
                }

                return null
              }}
            />

            {/* Recents Section */}
            {isAuthenticated && starshipSlug && (
              <div className="mt-6">
                <RecentsSection starshipSlug={starshipSlug} />
              </div>
            )}
          </div>
        </div>

        {/* User Profile Section */}
        <div className="flex-shrink-0 px-2 py-3 border-t border-border/20">
          <UserProfile
            mode="expanded"
            active={isSettingsRoute}
            onClick={() => {
              if (starshipSlug) {
                router.push(`/ship/${starshipSlug}/settings`)
              }
            }}
          />
        </div>
      </div>

    </div>
  )
}

// RecentsSection component to show recent conversations
interface RecentsSectionProps {
  starshipSlug: string
}

function RecentsSection({ starshipSlug }: RecentsSectionProps) {
  const router = useRouter()
  
  // Get user from auth context
  const { user } = useAuth()
  
  // Get starship data to get the starship ID
  const { data: userStarships } = useUserStarships(user?.id || '', !!user?.id)
  const starship = userStarships?.find(s => s.slug === starshipSlug)
  
  // Fetch conversations for this starship
  const { data: conversationsData } = useStarshipConversations(starship?.id || '', !!starship?.id)
  const conversations = conversationsData?.conversations || []
  
  // Take the 5 most recent conversations
  const recentConversations = conversations
    .slice()
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 5)

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ship/${starshipSlug}/conversations/${conversationId}`)
  }

  return (
    <div>
      <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Recents</h3>
      <div className="px-2 space-y-1">
        {recentConversations.length > 0 ? (
          recentConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => handleConversationClick(conversation.id)}
              className="w-full text-left px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-lg transition-colors truncate"
              title={conversation.title || 'Untitled conversation'}
            >
              {conversation.title || 'Untitled conversation'}
            </button>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">
            No recent conversations
          </div>
        )}
      </div>
    </div>
  )
}
