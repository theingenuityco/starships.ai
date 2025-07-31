'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import {
  Users, Rocket, BookOpen, Brain,
  Cpu, Zap, Eye, Command
} from 'lucide-react';
import { UserProfile } from '@/components/auth/UserProfile';
import { ThemeToggle } from '@/components/theme-toggle';
import { NavigationSection } from './NavigationSection';
import { NavigationItem } from './NavigationItem';

interface NavigationProps {
  mode?: 'sidebar' | 'module';
  isMobile?: boolean;
}


// Starship-internal navigation structure - function to generate paths based on current starship
const getStarshipNavigationSections = (starshipSlug: string) => [
  {
    title: "Starship Systems",
    items: [
      { href: `/ship/${starshipSlug}/command-deck`, label: "Command Deck", icon: Command, status: "optimal" },
      { href: `/ship/${starshipSlug}/crew`, label: "Crew", icon: Users, status: "optimal" },
      { href: `/ship/${starshipSlug}/drive`, label: "Drive", icon: Zap, status: "warning" }
    ]
  },
  {
    title: "Operations",
    items: [
      { href: `/ship/${starshipSlug}/expeditions`, label: "Expeditions", icon: Rocket, status: "active" },
      { href: `/ship/${starshipSlug}/logbook`, label: "Logbook", icon: BookOpen, status: "optimal" },
      { href: `/ship/${starshipSlug}/sibil`, label: "Sibil AI", icon: Brain, status: "optimal" },
      { href: `/ship/${starshipSlug}/vision-chamber`, label: "Vision Chamber", icon: Eye, status: "optimal" }
    ]
  }
];

// Animation variants
const containerVariants: any = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      staggerChildren: 0.2,
      delayChildren: 0.3
    }
  }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export function Navigation({
  mode = 'sidebar',
  isMobile: _isMobile = false
}: NavigationProps) {
  const pathname = usePathname();
  const { powerLevel, activeExpeditions, sibilInsights } = useStarshipStore();

  // Determine which navigation sections to show based on current route
  const getNavigationSections = () => {
    // Only show navigation inside starship context (/ship/<slug>/*)
    if (pathname.startsWith('/ship/')) {
      // Extract starship slug from path
      const pathParts = pathname.split('/');
      const starshipSlug = pathParts[2]; // /ship/<slug>/...
      return getStarshipNavigationSections(starshipSlug);
    }
    
    // No navigation for fleet-level routes
    return [];
  };

  const navigationSections = getNavigationSections();

  // Module mode - simplified layout
  if (mode === 'module') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3">
          {navigationSections.map((section) => (
            <NavigationSection
              key={section.title}
              title={section.title}
              items={section.items}
              pathname={pathname}
              compact={true}
            />
          ))}
        </div>
      </div>
    );
  }

  // Sidebar mode - island-style layout
  return (
    <motion.div
      className="flex flex-col h-full"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div className="p-3 border-b border-border/50" variants={itemVariants}>
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between min-w-0"
        >
          <div className="flex items-center w-full justify-between">
            <h2 className="text-lg font-semibold truncate">Navigation</h2>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Quick Status */}
      <motion.div variants={itemVariants} className="p-3 border-b border-border/50">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm min-w-0">
            <span className="text-muted-foreground truncate">Power</span>
            <span className="font-mono flex-shrink-0 ml-2">{powerLevel}%</span>
          </div>
          <div className="flex justify-between text-sm min-w-0">
            <span className="text-muted-foreground truncate">Expeditions</span>
            <span className="font-mono flex-shrink-0 ml-2">{activeExpeditions}</span>
          </div>
          <div className="flex justify-between text-sm min-w-0">
            <span className="text-muted-foreground truncate">Insights</span>
            <span className="font-mono flex-shrink-0 ml-2">{sibilInsights}</span>
          </div>
        </div>
      </motion.div>

      {/* Navigation Sections */}
      <motion.div variants={itemVariants} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {navigationSections.map((section) => (
            <NavigationSection
              key={section.title}
              title={section.title}
              items={section.items}
              pathname={pathname}
              compact={true}
            />
          ))}
        </div>
      </motion.div>

      {/* User Profile Section */}
      <motion.div variants={itemVariants} className="border-t border-border/50 p-3">
        <UserProfile mode="expanded" />
      </motion.div>
    </motion.div>
  );
}