import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { 
  Command, Users, Rocket, BookOpen, Brain, 
  Cpu, Zap, BarChart3, ChevronRight, Maximize2 
} from 'lucide-react';
import { QuickActionModule } from './QuickActionModule';

interface NavigationModuleProps {
  moduleId?: string;
  mode?: 'sidebar' | 'module';
  visibility?: 'collapsed' | 'partial' | 'expanded';
  onExpand?: () => void;
  onCollapse?: () => void;
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

export function NavigationModule({ 
  moduleId, 
  mode = 'sidebar',
  visibility = 'partial', 
  onExpand, 
  onCollapse, 
  isMobile = false 
}: NavigationModuleProps) {
  const pathname = usePathname();
  const { powerLevel, activeExpeditions, sibilInsights } = useStarshipStore();

  const isContentVisible = mode === 'module' || isMobile || visibility === 'partial' || visibility === 'expanded';
  const isCollapsed = mode === 'sidebar' && !isMobile && visibility === 'collapsed';

  // Module mode - simplified layout
  if (mode === 'module') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </h4>
              <div className="space-y-1">
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

  // Sidebar mode - original layout
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-b border-border`}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between min-w-0"
        >
          {isCollapsed ? (
            <button
              onClick={onExpand}
              className="p-2 rounded hover:bg-accent w-full flex justify-center"
              aria-label="Expand command deck"
            >
              <Command className="w-4 h-4" />
            </button>
          ) : (
            <>
              <h2 className="text-lg font-semibold truncate">Command Deck</h2>
              {visibility === 'expanded' ? (
                <button
                  onClick={onCollapse}
                  className="p-1 rounded hover:bg-accent flex-shrink-0 ml-2"
                  aria-label="Collapse command deck"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
              ) : (
                <button
                  onClick={onExpand}
                  className="p-1 rounded hover:bg-accent flex-shrink-0 ml-2"
                  aria-label="Expand command deck"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Quick Status */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isContentVisible ? 1 : 0 }}
        className="p-3 border-b border-border"
      >
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-1' : 'p-3'}`}
      >
        {isCollapsed ? (
          // Collapsed state - icons only
          <div className="space-y-2">
            {navigationSections.flatMap(section => section.items).map((item) => (
              <CollapsedNavigationItem
                key={item.href}
                {...item}
                isActive={pathname === item.href}
              />
            ))}
          </div>
        ) : (
          // Partial/Expanded state - full navigation as module
          <div className="space-y-3">
            {/* Navigation List Module */}
            <div className="bg-card/50 border border-border rounded-lg p-3">
              {/* Navigation Module Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg" role="img" aria-hidden="true">🧭</span>
                <h3 className="text-sm font-medium text-foreground">Ship Navigation</h3>
              </div>
              
              {/* Navigation Sections */}
              <div className="space-y-3">
                {navigationSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {section.title}
                    </h4>
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <NavigationItem
                          key={item.href}
                          {...item}
                          isActive={pathname === item.href}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Action Module - Context-aware & Dynamic */}
            <QuickActionModule />
          </div>
        )}
      </motion.div>


    </div>
  );
}

const NavigationItem = ({ href, label, icon: Icon, status, isActive, compact = false }: any) => (
  <Link href={href}>
    <motion.div
      className={`group relative ${compact ? 'p-1.5' : 'p-2'} rounded-lg transition-all duration-200 ${
        isActive 
          ? 'bg-primary/10 border border-primary/20' 
          : 'hover:bg-accent/50'
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative flex-shrink-0">
          <Icon className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          {status === 'warning' && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full" />
          )}
          {status === 'active' && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
          )}
        </div>
        <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'} truncate`}>{label}</span>
      </div>
    </motion.div>
  </Link>
);

const CollapsedNavigationItem = ({ href, label, icon: Icon, status, isActive }: any) => (
  <Link href={href}>
    <motion.div
      className={`group relative p-2 rounded-lg transition-all duration-200 flex justify-center ${
        isActive 
          ? 'bg-primary/10 border border-primary/20' 
          : 'hover:bg-accent/50'
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={label} // Tooltip for collapsed state
    >
      <div className="relative">
        <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
        {status === 'warning' && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full" />
        )}
        {status === 'active' && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
        )}
      </div>
    </motion.div>
  </Link>
); 