'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import {
  Users, Rocket, BookOpen, Brain,
  Cpu, Zap, Eye, Command, Power,
  Activity, Lightbulb, ChevronRight,
  Gauge
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

  // Sidebar mode - professional layout
  return (
    <motion.div
      className="flex flex-col h-full bg-gradient-to-b from-background to-muted/5 border-r border-border/50"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Enhanced Header */}
      <motion.div className="p-4 border-b border-border/40 bg-card/50 backdrop-blur-sm" variants={itemVariants}>
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between min-w-0"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Command className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Navigation</h2>
              <p className="text-xs text-muted-foreground">System Control</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </motion.div>
      </motion.div>

      {/* Enhanced Quick Status */}
      <motion.div variants={itemVariants} className="p-4 border-b border-border/40 bg-gradient-to-br from-card/30 to-muted/20">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gauge className="w-3 h-3" />
          System Status
        </h3>
        <div className="space-y-3">
          {/* Power Status */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-sm min-w-0">
              <span className="text-muted-foreground flex items-center gap-2">
                <Power className="w-3 h-3" />
                Power
              </span>
              <span className={`font-mono flex-shrink-0 ml-2 font-semibold ${
                powerLevel > 70 ? 'text-green-600 dark:text-green-400' : 
                powerLevel > 30 ? 'text-yellow-600 dark:text-yellow-400' : 
                'text-red-600 dark:text-red-400'
              }`}>
                {powerLevel}%
              </span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-1.5">
              <motion.div 
                className={`h-1.5 rounded-full ${
                  powerLevel > 70 ? 'bg-gradient-to-r from-green-500 to-green-600' : 
                  powerLevel > 30 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' : 
                  'bg-gradient-to-r from-red-500 to-red-600'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${powerLevel}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
          
          {/* Expeditions Status */}
          <div className="flex justify-between items-center text-sm min-w-0 group hover:bg-primary/5 rounded-lg p-2 -m-2 transition-colors">
            <span className="text-muted-foreground flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Active Expeditions
            </span>
            <span className="font-mono flex-shrink-0 ml-2 font-semibold bg-primary/10 px-2 py-0.5 rounded text-primary">
              {activeExpeditions}
            </span>
          </div>
          
          {/* Insights Status */}
          <div className="flex justify-between items-center text-sm min-w-0 group hover:bg-primary/5 rounded-lg p-2 -m-2 transition-colors">
            <span className="text-muted-foreground flex items-center gap-2">
              <Lightbulb className="w-3 h-3" />
              New Insights
            </span>
            <span className="font-mono flex-shrink-0 ml-2 font-semibold bg-purple-500/10 px-2 py-0.5 rounded text-purple-600 dark:text-purple-400">
              {sibilInsights}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Enhanced Navigation Sections */}
      <motion.div variants={itemVariants} className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-6">
          {navigationSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * index }}
            >
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

      {/* Enhanced User Profile Section */}
      <motion.div 
        variants={itemVariants} 
        className="border-t border-border/40 bg-gradient-to-br from-card/30 to-muted/20 backdrop-blur-sm"
      >
        <UserProfile mode="expanded" />
      </motion.div>
    </motion.div>
  );
}