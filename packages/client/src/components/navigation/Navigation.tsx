'use client'

import { UserProfile } from '@/components/auth/UserProfile'
import { NavigationSection } from '@/components/navigation/NavigationSection'
import { ThemeToggle } from '@/components/theme-toggle'
import { Command, MessageSquare, Target, Users } from 'lucide-react'
import { motion } from 'motion/react'
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

// Animation variants
const containerVariants: any = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
}

const itemVariants: any = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

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
    <motion.div
      className="flex flex-col w-16 bg-gradient-to-b from-background/95 to-muted/20 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-border/30"
      style={{ height: 'calc(100vh - 3rem)' }} // Full height minus top (1.5rem) and bottom (1.5rem) padding
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Compact Header with Theme Toggle */}
      <motion.div className="p-3 border-b border-border/20 flex-shrink-0" variants={itemVariants}>
        <div className="flex flex-col items-center gap-2">
          <div className="p-2 bg-primary/15 rounded-xl">
            <Command className="w-5 h-5 text-primary" />
          </div>
          <ThemeToggle />
        </div>
      </motion.div>

      {/* Navigation Items - Icon Only */}
      <motion.div variants={itemVariants} className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0 flex flex-col justify-center">
        <div className="space-y-2">
          {navigationSections.map(section => (
            <NavigationSection key={section.title} title={section.title} items={section.items} pathname={pathname} />
          ))}
        </div>
      </motion.div>

      {/* User Profile Section - Collapsed Mode */}
      <motion.div variants={itemVariants} className="border-t border-border/20 flex-shrink-0 p-2">
        <UserProfile mode="collapsed" />
      </motion.div>
    </motion.div>
  )
}
