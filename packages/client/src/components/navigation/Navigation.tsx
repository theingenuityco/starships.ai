'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import { ConversationList } from '@/components/conversation/ConversationList'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { MessageSquare, Target, Users } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

interface NavigationProps {
  isMobile?: boolean
}

// Starship-internal navigation structure - function to generate paths based on current starship
const getStarshipNavigationSections = (starshipSlug: string) => [
  {
    title: 'Starship Systems',
    items: [
      {
        href: `/ship/${starshipSlug}/conversations`,
        label: 'Conversations',
        icon: MessageSquare,
        status: 'optimal',
      },
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

  // Determine navigation width based on whether conversation list should be shown
  const showConversationList = isConversationRoute && starshipData?.id

  // Floating mode - expandable layout
  return (
    <div
      className={`flex flex-row frosted-glass rounded-2xl overflow-hidden shadow-frosted-xl transition-all duration-300 ease-in-out ${showConversationList ? 'max-w-sm' : 'w-16'}`}
      style={{
        height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        width: showConversationList ? 'min(384px, calc(100vw - 6rem))' : '4rem', // Responsive width with viewport consideration
      }}
    >
      {/* Left Side - Icon Navigation */}
      <div className="flex flex-col w-16 flex-shrink-0">
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

        {/* Navigation Items - Icon Only */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0 flex flex-col justify-center">
          <div className="space-y-2">
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
      {showConversationList && (
        <div className="flex-1 border-l border-border/20">
          <ConversationList starshipId={starshipData.id} onConversationDelete={handleConversationDelete} onConversationArchive={handleConversationArchive} />
        </div>
      )}
    </div>
  )
}
