'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { UserProfile } from '@/components/auth/UserProfile'
import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'

import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface NavigationProps {
  isMobile?: boolean
}

// Global navigation structure that works for all authenticated users
const getGlobalNavigationSections = (starshipSlug: string | null) => [
  {
    title: 'Resources',
    items: [{ href: `/marketplace`, label: 'Marketplace', icon: 'store', status: 'optimal' }],
  },
  ...(starshipSlug
    ? [
        {
          title: 'Settings',
          items: [{ href: `/ship/${starshipSlug}/settings/environment`, label: 'Environment', icon: 'key', status: 'optimal' }],
        },
      ]
    : []),
]

export function Navigation(props: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()

  // State for conversation list toggle
  const [showConversationList, setShowConversationList] = useState(false)
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

  // Check if we're on a conversation route
  const isConversationRoute = pathname.includes('/conversations')
  const isOverviewRoute = starshipSlug ? pathname === `/ship/${starshipSlug}` : false

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

  // Handle conversation history toggle
  const handleToggleConversationHistory = () => {
    setShowConversationList(!showConversationList)
  }

  // Handle conversation selection - hide history pane
  const handleConversationSelect = (conversationId: string) => {
    setShowConversationList(false)
  }

  // Show comprehensive navigation for all authenticated users
  const getNavigationSections = () => {
    if (!isAuthenticated) return []
    return getGlobalNavigationSections(starshipSlug)
  }

  const navigationSections = getNavigationSections()

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
        className="flex flex-col items-center justify-center w-20 flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        }}
      >
        {/* Compact Header with Theme Toggle */}
        <div className="px-3 py-5 border-b border-border/20 flex-shrink-0 flex items-center justify-center">
          <div className="cursor-pointer hover:scale-105 transform transition-transform" onClick={handleLogoClick} title="Navigate to Overview">
            <StarshipsLogo width={42} height={42} className="text-foreground" gradientId="nav-gradient" animationDelay={1} repeatDelay={20} triggerAnimation={animationTrigger} />
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
          <div className="p-3 space-y-3">
            {/* Overview - First nav item */}
            {starshipSlug && (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Link href={`/ship/${starshipSlug}`}>
                    <motion.div
                      className={`group relative transition-all duration-300 mx-auto rounded-xl z-10 flex items-center justify-center w-12 h-12 border ${
                        isOverviewRoute
                          ? 'bg-gradient-to-r from-primary/25 to-primary/20 shadow-md border-primary/15'
                          : 'border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <LordIcon src={getLordiconUrl('rocket')} width={32} height={32} className="w-[32px] h-[32px]" trigger="hover" />
                    </motion.div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                  Overview
                </TooltipContent>
              </Tooltip>
            )}
            {/* Conversations Section - Only show when user has a starship */}
            {starshipSlug && (
              <div>
                {/* Main Conversations Icon - Standalone */}
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Link href={`/ship/${starshipSlug}/conversations`}>
                      <motion.div
                        className={`group relative transition-all duration-300 mx-auto rounded-xl z-10 flex items-center justify-center w-12 h-12 border ${
                          isConversationRoute
                            ? 'bg-gradient-to-r from-primary/25 to-primary/20 shadow-md border-primary/15'
                            : 'border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <LordIcon src={getLordiconUrl('message-square')} width={32} height={32} className="w-[32px] h-[32px]" trigger="hover" />
                      </motion.div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                    Conversations
                  </TooltipContent>
                </Tooltip>

                {/* Expanded Sub-icons Container - Visually joined from bottom */}
                <AnimatePresence>
                  {isConversationRoute && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="border-l border-r border-b border-primary/15 rounded-bl-xl rounded-br-xl mx-1.5 space-y-1.5 overflow-hidden -mt-2 pt-4 pb-2 flex flex-col items-center three-way-border"
                    >
                      {/* New Conversation Icon */}
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <motion.button
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            onClick={handleNewConversation}
                            className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-10 h-10 border border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <LordIcon src={getLordiconUrl('plus')} width={24} height={24} className="w-[24px] h-[24px]" trigger="hover" />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                          New Conversation
                        </TooltipContent>
                      </Tooltip>

                      {/* Conversation History Toggle Icon */}
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <motion.button
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            onClick={handleToggleConversationHistory}
                            className="group relative transition-all duration-300 rounded-lg flex items-center justify-center w-10 h-10 border border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {showConversationList ? (
                              <LordIcon src={getLordiconUrl('x')} width={24} height={24} className="w-[24px] h-[24px]" trigger="hover" />
                            ) : (
                              <LordIcon src={getLordiconUrl('history')} width={24} height={24} className="w-[24px] h-[24px]" trigger="hover" />
                            )}
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                          {showConversationList ? 'Hide' : 'Show'} History
                        </TooltipContent>
                      </Tooltip>

                      {/* Ship Management Icon */}
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Link href={`/ship/${starshipSlug}/management`}>
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 }}
                              className={`group relative transition-all duration-300 rounded-lg flex items-center justify-center w-10 h-10 border ${
                                pathname === `/ship/${starshipSlug}/management`
                                  ? 'bg-gradient-to-r from-primary/25 to-primary/20 shadow-md border-primary/15'
                                  : 'border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                              }`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <LordIcon src={getLordiconUrl('settings')} width={24} height={24} className="w-[24px] h-[24px]" trigger="hover" />
                            </motion.div>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                          Ship Management
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Other Navigation Items */}
            {navigationSections.map(section => (
              <NavigationSection key={section.title} title={section.title} items={section.items} pathname={pathname} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <ThemeToggle />
        </div>
        {/* User Profile Section - Collapsed Mode */}
        <div className="border-t border-border/20 flex-shrink-0 p-2 flex items-center justify-center">
          <UserProfile mode="collapsed" />
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
