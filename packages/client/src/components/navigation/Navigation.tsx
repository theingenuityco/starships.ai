'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { UserProfile } from '@/components/auth/UserProfile'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useSelectedStarship, useUserStarships, useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipConversations, useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useAuth } from '@/hooks/useAuth'

import { motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/primitives/Icon'
import { Orbitron } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

// (All items are composed into a single NavigationSection below)

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  // Navigation is always expanded like Claude - clean and simple
  const expanded = true
  const showLabels = false
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

  // Get current starship data to pass starship name to UserProfile
  const { data: currentStarship } = useStarshipBySlug(starshipSlug || '', !!starshipSlug)

  // Route checking for active states
  const isOverviewRoute = starshipSlug ? pathname === `/ship/${starshipSlug}` : false
  const isSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings`) : false
  const isEnvironmentSettingsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/settings/environment`) : false
  const isAgentsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agents`) : false
  const isAgentBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/agent/`) : false
  const isToolsRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tools`) : false
  const isToolBuilderRoute = starshipSlug ? pathname.startsWith(`/ship/${starshipSlug}/tool/`) : false

  // Handle new conversation
  const handleNewConversation = () => {
    router.push(`/ship/${starshipSlug}/conversations`)
  }

  // Build a single unified navigation section list
  const mainNavigationItems = [
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}`, label: 'Overview', icon: 'overview', isActive: isOverviewRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/agents`, label: 'Agents', icon: 'agents', isActive: isAgentsRoute || isAgentBuilderRoute }] : []),
    ...(isAuthenticated && starshipSlug ? [{ href: `/ship/${starshipSlug}/tools`, label: 'Tools', icon: 'tools', isActive: isToolsRoute || isToolBuilderRoute }] : []),
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

  // Full height mode - touching top, bottom, and left edges
  return (
    <div ref={sidebarRef} className="flex flex-row overflow-hidden shadow-frosted-lg bg-muted/50 backdrop-blur-md relative z-[100] h-screen border-r border-border/30">
      <div className="flex flex-col flex-shrink-0 w-64 h-full">
        {/* Header */}
        <div className="px-3 py-3 flex-shrink-0 flex items-center space-x-3 bg-black relative z-[101]">
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
            <h1 className={`${orbitron.className} text-xl font-normal tracking-tight text-white`}>starships.ai</h1>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Fixed Top Section - New Chat Button and Main Navigation */}
          <div className="flex-shrink-0 px-2 py-3 space-y-4">
            {/* New Chat Button */}
            {isAuthenticated && starshipSlug && (
              <button onClick={handleNewConversation} className="group relative w-full transition-all duration-300 flex items-center px-2 py-2 hover:bg-muted/30 rounded-lg">
                <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 transition-all duration-300 transform group-hover:scale-105" style={{ backgroundColor: '#F5A61F' }}>
                  <LordIcon src={getLordiconUrl('plus')} width={16} height={16} className="w-[16px] h-[16px] text-white" trigger="click" />
                </div>
                <span className="text-sm font-medium transition-colors duration-300" style={{ color: '#F5A61F' }}>
                  New Chat
                </span>
              </button>
            )}

            {/* Main Navigation */}
            <NavigationSection title="Navigation" items={mainNavigationItems} pathname={pathname} showLabels={showLabels} expanded={expanded} />
          </div>

          {/* Recents Section with Fixed Header */}
          {isAuthenticated && starshipSlug && (
            <div className="flex-1 min-h-0 mt-4 pt-6 border-t border-border/20 flex flex-col">
              {/* Fixed Recents Header */}
              <div className="flex-shrink-0 px-2 mb-2">
                <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <LordIcon src={getLordiconUrl('history')} width={12} height={12} className="w-3 h-3" />
                  Recents
                </h3>
              </div>
              {/* Scrollable Conversations List */}
              <div className="flex-1 min-h-0 overflow-y-auto px-2">
                <RecentsSection starshipSlug={starshipSlug} />
              </div>
            </div>
          )}
        </div>

        {/* User Profile Section */}
        <div className="flex-shrink-0 px-2 py-3 border-t border-border/20">
          <UserProfile
            mode="expanded"
            active={isSettingsRoute}
            starshipName={currentStarship?.name}
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
  const pathname = usePathname()

  // Get user from auth context
  const { user } = useAuth()

  // Get starship data to get the starship ID
  const { data: userStarships } = useUserStarships(user?.id || '', !!user?.id)
  const starship = userStarships?.find(s => s.slug === starshipSlug)

  // Fetch conversations for this starship
  const { data: conversationsData } = useStarshipConversations(starship?.id || '', !!starship?.id)
  const conversations = conversationsData?.conversations || []

  // Show ALL conversations sorted by most recent
  const recentConversations = conversations
    .slice()
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })

  const handleConversationClick = (conversationId: string) => {
    router.push(`/ship/${starshipSlug}/conversations/${conversationId}`)
  }

  return (
    <div>
      <div className="space-y-1">
        {recentConversations.length > 0 ? (
          recentConversations.map(conversation => {
            // Check if this conversation is currently active
            const isActive = pathname === `/ship/${starshipSlug}/conversations/${conversation.id}`
            return (
              <ConversationItem 
                key={conversation.id} 
                conversation={conversation} 
                onClick={() => handleConversationClick(conversation.id)}
                isActive={isActive}
              />
            )
          })
        ) : (
          <div className="text-sm text-muted-foreground px-2">No recent conversations</div>
        )}
      </div>
    </div>
  )
}

// ConversationItem component with three-dot menu
interface ConversationItemProps {
  conversation: any
  onClick: () => void
  isActive?: boolean
}

function ConversationItem({ conversation, onClick, isActive = false }: ConversationItemProps) {
  const [showMenu, setShowMenu] = useState(false)
  const deleteConversationMutation = useDeleteConversation()
  const updateConversationStatusMutation = useUpdateConversationStatus()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      // Check if this conversation is currently active before deleting
      const pathname = window.location.pathname
      const starshipSlug = pathname.split('/')[2] // Extract starship slug from URL
      const isCurrentlyViewing = pathname === `/ship/${starshipSlug}/conversations/${conversation.id}`
      
      await deleteConversationMutation.mutateAsync(conversation.id)
      setShowMenu(false)
      
      // If user was viewing this conversation, redirect to + New Chat
      if (isCurrentlyViewing && starshipSlug) {
        window.location.href = `/ship/${starshipSlug}/chat`
      }
    } catch (error) {
      // Error handling is done in the mutation hook
      console.error('Delete conversation error:', error)
    }
  }

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await updateConversationStatusMutation.mutateAsync({
        conversationId: conversation.id,
        status: 'archived',
      })
      setShowMenu(false)
    } catch (error) {
      // Error handling is done in the mutation hook
    }
  }

  return (
    <div className="relative group" ref={menuRef}>
      <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1.5 text-sm rounded-lg transition-colors truncate pr-8 ${
          isActive 
            ? 'bg-primary/20 text-primary border border-primary/30' 
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }`}
        title={conversation.title || 'Untitled conversation'}
      >
        {conversation.title || 'Untitled conversation'}
      </button>

      {/* Three-dot menu button */}
      <button
        onClick={e => {
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        className="absolute right-1 top-1/2 transform -translate-y-1/2 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-all duration-200"
      >
        <div className="flex flex-col space-y-0.5">
          <div className="w-1 h-1 bg-current rounded-full"></div>
          <div className="w-1 h-1 bg-current rounded-full"></div>
          <div className="w-1 h-1 bg-current rounded-full"></div>
        </div>
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-28 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <button
            onClick={handleArchive}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
            disabled={updateConversationStatusMutation.isPending}
          >
            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
            Archive
          </button>
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-muted/50 transition-colors flex items-center gap-2"
            disabled={deleteConversationMutation.isPending}
          >
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
