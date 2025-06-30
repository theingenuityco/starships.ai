import { motion } from 'motion/react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';

// Import consciousness modules
import { VisionChamber } from '@/components/consciousness/VisionChamber';

// Import dashboard modules
import { SystemOverview } from './dashboard/SystemOverview';  
import { CrewManagement } from './dashboard/CrewManagement';
import { ExpeditionControl } from './dashboard/ExpeditionControl';
import { NavigationModule } from './modules/NavigationModule';

// Import starship selector
import { StarshipSelector } from './StarshipSelector';

interface ModuleConfig {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  defaultSize: 'small' | 'medium' | 'large';
  category: 'navigation' | 'consciousness' | 'systems' | 'operations';
  priority: number; // Display order
}

// Module Registry - Starship Module Collection
const AVAILABLE_MODULES: ModuleConfig[] = [
  // Navigation Module
  {
    id: 'navigation',
    title: 'Ship Navigation',
    component: NavigationModule,
    defaultSize: 'medium',
    category: 'navigation',
    priority: 0
  },
  // Consciousness Modules
  {
    id: 'vision-chamber',
    title: 'Vision Chamber',
    component: VisionChamber,
    defaultSize: 'large',
    category: 'consciousness',
    priority: 1
  },
  // System Modules
  {
    id: 'system-overview',
    title: 'System Status',
    component: SystemOverview,
    defaultSize: 'medium',
    category: 'systems',
    priority: 2
  },
  {
    id: 'crew-management',
    title: 'Crew Operations',
    component: CrewManagement,
    defaultSize: 'medium',
    category: 'operations',
    priority: 3
  },
  {
    id: 'expedition-control',
    title: 'Mission Control',
    component: ExpeditionControl,
    defaultSize: 'large',
    category: 'operations',
    priority: 4
  }
];

interface CommandDeckDashboardProps {
  onCollapse: () => void;
}

export function CommandDeckDashboard({ onCollapse }: CommandDeckDashboardProps) {
  const [activeModules, setActiveModules] = useState<string[]>([
    'navigation', 'system-overview', 'vision-chamber', 'crew-management', 'expedition-control'
  ]);
  const [moduleStates, setModuleStates] = useState<Record<string, any>>({});

  const enabledModules = AVAILABLE_MODULES
    .filter(module => activeModules.includes(module.id))
    .sort((a, b) => a.priority - b.priority);

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'small': return 'col-span-1 row-span-1';
      case 'medium': return 'col-span-1 row-span-2';
      case 'large': return 'col-span-2 row-span-2';
      default: return 'col-span-1 row-span-1';
    }
  };

  return (
    <div className="h-full flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Module Bay Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold">Module Bay</h1>
            <p className="text-sm text-muted-foreground">
              {enabledModules.length} modules active
            </p>
          </div>
          <StarshipSelector />
        </div>
        <button
          onClick={onCollapse}
          className="p-2 rounded hover:bg-accent"
          aria-label="Minimize module bay"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Module Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-4 auto-rows-[200px] h-fit">
          {enabledModules.map((moduleConfig) => {
            const ModuleComponent = moduleConfig.component;
            return (
              <ModuleContainer
                key={moduleConfig.id}
                config={moduleConfig}
                className={getSizeClasses(moduleConfig.defaultSize)}
              >
                <ModuleComponent 
                  moduleId={moduleConfig.id}
                  {...(moduleStates[moduleConfig.id] || {})}
                />
              </ModuleContainer>
            );
          })}
        </div>
      </div>

      {/* Module Control Panel */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>All modules operational</span>
        </div>
      </div>
    </div>
  );
}

interface ModuleContainerProps {
  config: ModuleConfig;
  children: React.ReactNode;
  className?: string;
}

function ModuleContainer({ config, children, className = '' }: ModuleContainerProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <motion.div
      className={`
        bg-card border border-border rounded-lg overflow-hidden
        hover:border-primary/20 transition-colors duration-200
        ${className}
      `}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Module Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full"></div>
          <h3 className="text-sm font-medium truncate">{config.title}</h3>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 rounded hover:bg-accent"
          aria-label={isMinimized ? "Expand module" : "Minimize module"}
        >
          {isMinimized ? (
            <Maximize2 className="w-3 h-3" />
          ) : (
            <Minimize2 className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Module Content */}
      <motion.div
        className="h-full overflow-hidden"
        animate={{ height: isMinimized ? 0 : 'auto' }}
        transition={{ duration: 0.2 }}
      >
        <div className="p-3 h-full">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
} 