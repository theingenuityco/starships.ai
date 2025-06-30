import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { useEffect, useState } from 'react';

// Import route-specific quick action modules
import { CrewQuickModule } from './quick-actions/CrewQuickModule';
import { DriveQuickModule } from './quick-actions/DriveQuickModule';
import { ExpeditionQuickModule } from './quick-actions/ExpeditionQuickModule';
import { LogbookQuickModule } from './quick-actions/LogbookQuickModule';
import { SibilQuickModule } from './quick-actions/SibilQuickModule';
import { SystemQuickModule } from './quick-actions/SystemQuickModule';

interface QuickActionModuleProps {
  moduleId?: string;
  className?: string;
}

export function QuickActionModule({ moduleId, className = '' }: QuickActionModuleProps) {
  const pathname = usePathname();
  const starshipData = useStarshipStore();
  
  // Dynamic state for evolving data
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isProcessing, setIsProcessing] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);

  // Simulate real-time updates like the original consciousness popups
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
      
      // Simulate processing states
      if (Math.random() > 0.7) {
        setIsProcessing(true);
        setTimeout(() => setIsProcessing(false), 2000);
      }
      
      // Add dynamic insights based on route
      if (Math.random() > 0.8) {
        const routeInsights = {
          '/crew': ['Crew morale high', 'New assignment available', 'Training session completed'],
          '/expeditions': ['Route analysis complete', 'New sector discovered', 'Mission parameters updated'],
          '/sibil': ['Pattern recognition enhanced', 'Prediction accuracy increased', 'New data correlation found'],
          '/drive': ['Engine efficiency improved', 'Navigation recalibrated', 'Fuel optimization active'],
          '/logbook': ['New entries archived', 'Search index updated', 'Data integrity verified']
        };
        
        const currentInsights = routeInsights[pathname as keyof typeof routeInsights] || ['System status updated'];
        const newInsight = currentInsights[Math.floor(Math.random() * currentInsights.length)];
        
        setInsights(prev => [newInsight, ...prev].slice(0, 3));
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [pathname]);

  // Determine which quick action module to show based on current route
  const getQuickActionModule = () => {
    const moduleProps = {
      data: { ...starshipData, isProcessing, insights, lastUpdate },
      onAction: (action: string, data?: any) => {
        // Handle quick actions - could trigger navigation or state updates
        console.log('Quick action triggered:', action, data);
        
        // Simulate action feedback
        setIsProcessing(true);
        setTimeout(() => setIsProcessing(false), 1500);
      }
    };

    switch (pathname) {
      case '/crew':
        return <CrewQuickModule {...moduleProps} />;
      case '/drive':
        return <DriveQuickModule {...moduleProps} />;
      case '/expeditions':
        return <ExpeditionQuickModule {...moduleProps} />;
      case '/logbook':
        return <LogbookQuickModule {...moduleProps} />;
      case '/sibil':
        return <SibilQuickModule {...moduleProps} />;
      default:
        return <SystemQuickModule {...moduleProps} />;
    }
  };

  const getModuleTitle = () => {
    switch (pathname) {
      case '/crew': return 'Crew Status';
      case '/drive': return 'Drive Systems';
      case '/expeditions': return 'Mission Control';
      case '/logbook': return 'Ship Logs';
      case '/sibil': return 'AI Insights';
      default: return 'Ship Overview';
    }
  };

  const getModuleIcon = () => {
    switch (pathname) {
      case '/crew': return '👥';
      case '/drive': return '🚀';
      case '/expeditions': return '🎯';
      case '/logbook': return '📚';
      case '/sibil': return '🧠';
      default: return '🛸';
    }
  };

  return (
    <motion.div
      key={pathname} // Re-mount on route change for transition
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={`bg-card/50 border border-border rounded-lg p-3 ${className}`}
    >
      {/* Module Header with Processing Indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-hidden="true">
            {getModuleIcon()}
          </span>
          <h3 className="text-sm font-medium text-foreground">
            {getModuleTitle()}
          </h3>
        </div>
        
        {/* Real-time Processing Indicator */}
        <div className="flex items-center gap-2">
          {isProcessing && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-2 h-2 border border-primary border-t-transparent rounded-full"
            />
          )}
          <div className="text-xs text-muted-foreground">
            {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Dynamic Module Content */}
      <div className="space-y-2">
        {getQuickActionModule()}
      </div>

      {/* Real-time Insights */}
      <AnimatePresence mode="popLayout">
        {insights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-2 border-t border-border/50"
          >
            <div className="text-xs text-muted-foreground mb-1">Recent Activity</div>
            <div className="space-y-1">
              {insights.slice(0, 2).map((insight, index) => (
                <motion.div
                  key={insight}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="text-xs text-primary/80 flex items-center gap-1"
                >
                  <div className="w-1 h-1 bg-primary rounded-full" />
                  {insight}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
} 