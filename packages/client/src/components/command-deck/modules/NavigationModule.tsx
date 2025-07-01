import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { 
  Users, Rocket, BookOpen, Brain, 
  Cpu, Zap
} from 'lucide-react';
import { UserProfile } from '@/components/auth/UserProfile';
import { ThemeToggle } from '@/components/theme-toggle';

interface NavigationModuleProps {
  mode?: 'sidebar' | 'module';
  isMobile?: boolean;
}

const navigationSections = [
  {
    title: "Core Systems",
    items: [
      { href: "/core", label: "System Core", icon: Cpu, status: "optimal" },
      { href: "/crew", label: "Crew", icon: Users, status: "optimal" },
      { href: "/drive", label: "Drive", icon: Zap, status: "warning" }
    ]
  },
  {
    title: "Operations",
    items: [
      { href: "/expeditions", label: "Expeditions", icon: Rocket, status: "active" },
      { href: "/logbook", label: "Logbook", icon: BookOpen, status: "optimal" },
      { href: "/sibil", label: "Sibil AI", icon: Brain, status: "optimal" }
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

export function NavigationModule({ 
  mode = 'sidebar',
  isMobile: _isMobile = false 
}: NavigationModuleProps) {
  const pathname = usePathname();
  const { powerLevel, activeExpeditions, sibilInsights } = useStarshipStore();

  // Currently only one navigation state; no collapsed/expanded variants

  // Module mode - simplified layout
  if (mode === 'module') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
                {section.title}
              </h4>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <NavigationItem
                    key={item.href}
                    {...item}
                    isActive={pathname === item.href}
                    compact={true}
                  />
                ))}
              </div>
            </div>
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
            <h2 className="text-lg font-semibold truncate">Command Deck</h2>
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

      {/* Navigation Module */}
      <motion.div variants={itemVariants} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
                {section.title}
              </h4>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <NavigationItem
                    key={item.href}
                    {...item}
                    isActive={pathname === item.href}
                    compact={true}
                  />
                ))}
              </div>
            </div>
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

const NavigationItem = ({ href, label, icon: Icon, status, isActive, compact = false }: any) => (
  <Link href={href}>
    <motion.div
      className={`group relative ${compact ? 'px-2 py-1.5' : 'px-2 py-2'} rounded-lg transition-all duration-200 ${
        isActive 
          ? 'bg-primary/10 backdrop-blur-sm border border-primary/20' 
          : 'hover:bg-accent/30 hover:backdrop-blur-sm'
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative flex-shrink-0">
          <Icon className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground transition-colors'}`} />
          {status === 'warning' && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          )}
          {status === 'active' && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        <span className={`font-medium ${compact ? 'text-sm' : 'text-sm'} truncate group-hover:text-foreground transition-colors`}>{label}</span>
      </div>
    </motion.div>
  </Link>
); 