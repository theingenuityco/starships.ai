'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { StarshipsLogo } from '@/components/ui/starships-logo'
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

  // Floating mode - compact icon-only layout
  return (
    <div
      className="flex flex-col w-16 frosted-glass rounded-2xl overflow-hidden shadow-frosted-xl"
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
  )
}
