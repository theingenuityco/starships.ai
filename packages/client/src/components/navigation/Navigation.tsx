'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Users, BookOpen,
  Zap, Command,
  Target, MessageSquare
} from 'lucide-react';
import { UserProfile } from '@/components/auth/UserProfile';
import { ThemeToggle } from '@/components/theme-toggle';
import { NavigationSection } from './NavigationSection';

interface NavigationProps {
  mode?: 'sidebar' | 'module';
  isMobile?: boolean;
}


// Starship-internal navigation structure - function to generate paths based on current starship
const getStarshipNavigationSections = (starshipSlug: string) => [
  {
    title: "Starship Systems",
    items: [
      { href: `/ship/${starshipSlug}/chat`, label: "Unified Chat", icon: MessageSquare, status: "optimal" },
      { href: `/ship/${starshipSlug}/crew`, label: "Crew", icon: Users, status: "optimal" },
      { href: `/ship/${starshipSlug}/missions`, label: "Missions", icon: Target, status: "optimal" }
    ]
  },
  {
    title: "Coming Soon",
    items: [
      { href: `/ship/${starshipSlug}/drive`, label: "Drive", icon: Zap, status: "optimal" },
      { href: `/ship/${starshipSlug}/logbook`, label: "Logbook", icon: BookOpen, status: "optimal" }
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
  mode = 'sidebar'
}: NavigationProps) {
  const pathname = usePathname();

  // Determine which navigation sections to show based on current route
  const getNavigationSections = () => {
    // Only show navigation inside starship context (/ship/<slug>/*)
    if (pathname.startsWith('/ship/')) {
      // Extract starship slug from path
      const pathParts = pathname.split('/');
      const starshipSlug = pathParts[2]; // /ship/<slug>/...
      return getStarshipNavigationSections(starshipSlug);
    }
    
    // No navigation for non-starship routes
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

  // Sidebar mode - professional layout
  return (
    <motion.div
      className="flex flex-col h-full bg-gradient-to-b from-background to-muted/5 border-r border-border/50"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Enhanced Header */}
      <motion.div className="p-3 pt-8 pb-8 border-b border-border/40 bg-card/50 backdrop-blur-sm flex-shrink-0" variants={itemVariants}>
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between min-w-0"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Command className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Navigation</h2>
              <p className="text-xs text-muted-foreground">System Control</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </motion.div>
      </motion.div>


      {/* Enhanced Navigation Sections */}
      <motion.div variants={itemVariants} className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0">
        <div className="space-y-4 mt-4">
          {navigationSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * index }}
            >
              {index > 0 && (
                <div className="my-3 px-3">
                  <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                </div>
              )}
              <NavigationSection
                title={section.title}
                items={section.items}
                pathname={pathname}
                compact={true}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      
      {/* Enhanced User Profile Section */}
      <motion.div 
        variants={itemVariants} 
        className="border-t border-border/40 bg-gradient-to-br from-card/30 to-muted/20 backdrop-blur-sm flex-shrink-0 pb-1"
      >
        <UserProfile mode="expanded" />
      </motion.div>
    </motion.div>
  );
}