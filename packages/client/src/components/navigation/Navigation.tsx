'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { History, MessageSquare, Plus, Target, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

interface NavigationProps {
  isMobile?: boolean
}

// Starship-internal navigation structure - function to generate paths based on current starship
const getStarshipNavigationSections = (starshipSlug: string) => [
  {
    title: 'Starship Systems',
    items: [
      { href: `/ship/${starshipSlug}/crew`, label: 'Crew', icon: Users, status: 'optimal' },
      {
        href: `/ship/${starshipSlug}/missions`,
        label: 'Missions',
        icon: Target,
        status: 'optimal',
      },
    ],
  },
]

export function Navigation({}: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()

  // State for conversation list toggle
  const [showConversationList, setShowConversationList] = useState(false)

  // Extract starship slug from path
  const getStarshipSlug = () => {
    if (pathname.startsWith('/ship/')) {
      const pathParts = pathname.split('/')
      return pathParts[2] // /ship/<slug>/...
    }
    return null
  }

  const starshipSlug = getStarshipSlug()

  // Check if we're on a conversation route
  const isConversationRoute = pathname.includes('/conversations')

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

  // Determine which navigation sections to show based on current route
  const getNavigationSections = () => {
    // Only show navigation inside starship context (/ship/<slug>/*)
    if (starshipSlug) {
      return getStarshipNavigationSections(starshipSlug)
    }

    // No navigation for non-starship routes
    return []
  }

  const navigationSections = getNavigationSections()

  // Handle logo click - navigate to conversations
  const handleLogoClick = () => {
    if (starshipSlug) {
      router.push(`/ship/${starshipSlug}/conversations`)
    }
  }

  // Floating mode - expandable layout
  return (
    <div className="flex flex-row frosted-glass rounded-2xl overflow-hidden shadow-frosted-xl transition-all duration-300 ease-in-out">
      <div
        className="flex flex-col w-16 flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        }}
      >
        {/* Compact Header with Theme Toggle */}
        <div className="p-3 border-b border-border/20 flex-shrink-0">
          <div className="flex flex-col items-center gap-2">
            <div
              className="p-2 bg-primary/15 rounded-xl cursor-pointer hover:bg-primary/25 transition-colors duration-200 hover:scale-105 transform transition-transform"
              onClick={handleLogoClick}
              title="Navigate to Conversations"
            >
              <StarshipsLogo width={20} height={20} gradientId="nav-gradient" animationDelay={1} repeatDelay={8} />
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          <div className="p-2 space-y-2">
            {/* Conversations Section - Expandable when on conversation routes */}
            <div>
              {/* Main Conversations Icon - Standalone */}
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Link href={`/ship/${starshipSlug}/conversations`}>
                    <motion.div
                      className={`group relative transition-all duration-300 mx-1 p-2 rounded-xl z-10 ${
                        isConversationRoute
                          ? 'bg-gradient-to-r from-primary/25 to-primary/20 shadow-md border border-primary/15'
                          : 'hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex items-center justify-center">
                        <MessageSquare className={`w-5 h-5 ${isConversationRoute ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
                      </div>
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
                    className="border-l border-r border-b border-primary/15 rounded-bl-xl rounded-br-xl mx-1 space-y-1 overflow-hidden -mt-2 pt-4 pb-2 flex flex-col items-center three-way-border"
                  >
                    {/* New Conversation Icon */}
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <motion.button
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 }}
                          onClick={handleNewConversation}
                          className="group relative transition-all duration-300 p-1.5 rounded-lg hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="flex items-center justify-center">
                            <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
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
                          className="group relative transition-all duration-300 p-1.5 rounded-lg hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="flex items-center justify-center">
                            {showConversationList ? (
                              <X className="w-4 h-4 text-primary transition-colors" />
                            ) : (
                              <History className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            )}
                          </div>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-popover border border-border shadow-xl rounded-lg text-popover-foreground font-medium z-[1001]" sideOffset={12}>
                        {showConversationList ? 'Hide' : 'Show'} History
                      </TooltipContent>
                    </Tooltip>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Other Navigation Items */}
            {navigationSections.map(section => (
              <NavigationSection key={section.title} title={section.title} items={section.items} pathname={pathname} />
            ))}
          </div>
        </div>

        {/* User Profile Section - Collapsed Mode */}
        <div className="border-t border-border/20 flex-shrink-0 p-2">
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
            <ConversationList starshipId={starshipData.id} onConversationDelete={handleConversationDelete} onConversationArchive={handleConversationArchive} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
