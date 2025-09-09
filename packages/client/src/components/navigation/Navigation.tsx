'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { Command, MessageSquare, Target, Users } from 'lucide-react'
import { usePathname } from 'next/navigation'

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

  // Determine which navigation sections to show based on current route
  const getNavigationSections = () => {
    // Only show navigation inside starship context (/ship/<slug>/*)
    if (pathname.startsWith('/ship/')) {
      // Extract starship slug from path
      const pathParts = pathname.split('/')
      const starshipSlug = pathParts[2] // /ship/<slug>/...
      return getStarshipNavigationSections(starshipSlug)
    }

    // No navigation for non-starship routes
    return []
  }

  const navigationSections = getNavigationSections()

  // Floating mode - compact icon-only layout
  return (
    <div
      className="flex flex-col w-16 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-border/20 bg-background/5 dark:bg-foreground/5"
      style={{
        height: 'calc(100vh - 3rem)', // Full height minus top (1.5rem) and bottom (1.5rem) padding
        background: 'linear-gradient(135deg, hsl(var(--background) / 0.03) 0%, hsl(var(--background) / 0.01) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      }}
    >
      {/* Compact Header with Theme Toggle */}
      <div className="p-3 border-b border-border/20 flex-shrink-0">
        <div className="flex flex-col items-center gap-2">
          <div className="p-2 bg-primary/15 rounded-xl">
            <Command className="w-5 h-5 text-primary" />
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
