'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Brain, TrendingUp, Clock, Star, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Decision {
  id: string;
  route: string;
  timestamp: Date;
  confidence: number;
  insight: string;
}

interface AetherCortexProps {
  isVisible: boolean;
  recentDecisions: Decision[];
  currentRouteInsights: string[];
  processingPower: number; // 0-100
  onClose?: () => void;
}

export function AetherCortex({ 
  isVisible, 
  recentDecisions, 
  currentRouteInsights,
  processingPower,
  onClose
}: AetherCortexProps) {
  const pathname = usePathname();
  const { shouldReduceMotion } = useReducedMotion();

  // Keyboard navigation setup
  const { containerRef } = useKeyboardNavigation({
    onEscape: onClose,
    isEnabled: isVisible,
    trapFocus: false // Allow navigation within the content
  });
  
  const getRouteEmoji = (route: string) => {
    const routeMap: Record<string, string> = {
      '/crew': '👥',
      '/core': '🧠', 
      '/expeditions': '🚀',
      '/drive': '🔋',
      '/logbook': '📚',
      '/sibil': '👁️'
    };
    return routeMap[route] || '🛸';
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={containerRef as any}
          initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95, y: -10 }}
          animate={shouldReduceMotion ? {} : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95, y: -10 }}
          transition={shouldReduceMotion ? { duration: 0 } : { 
            type: "spring", 
            stiffness: 300, 
            damping: 30,
            mass: 0.8,
            delay: 0.1 
          }}
          className="absolute top-full right-0 mt-2 w-80 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg z-50"
          role="complementary"
          aria-labelledby="aether-cortex-title"
          aria-describedby="aether-cortex-description"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-purple-500/10 rounded-md" aria-hidden="true">
                  <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 id="aether-cortex-title" className="font-medium text-sm">Aether Cortex</h3>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1" role="status" aria-live="polite">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground" aria-label={`Processing power at ${processingPower} percent active`}>
                    {processingPower}% active
                  </span>
                </div>
                
                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                    aria-label="Close aether cortex"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <p id="aether-cortex-description" className="text-xs text-muted-foreground mb-4">
              Real-time consciousness processing and navigation insights
            </p>

            {/* Current Route Insights */}
            <section className="mb-4" aria-labelledby="current-insights-heading">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-3 h-3 text-blue-500" aria-hidden="true" />
                <h4 id="current-insights-heading" className="text-xs font-medium">Current Section Insights</h4>
              </div>
              
              {currentRouteInsights.length > 0 ? (
                <div className="space-y-1">
                  {currentRouteInsights.slice(0, 3).map((insight, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="text-xs p-2 bg-background/50 border border-border/50 rounded flex items-start space-x-2"
                    >
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span className="text-muted-foreground">{insight}</span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2 bg-muted/30 border border-dashed border-border rounded">
                  Observing patterns in {getRouteEmoji(pathname)} section...
                </div>
              )}
            </section>

            {/* Recent Decisions */}
            <section aria-labelledby="recent-decisions-heading">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-3 h-3 text-orange-500" aria-hidden="true" />
                <h4 id="recent-decisions-heading" className="text-xs font-medium">Recent Navigation Decisions</h4>
              </div>
              
              {recentDecisions.length > 0 ? (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {recentDecisions.slice(0, 4).map((decision, index) => (
                    <motion.div
                      key={decision.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between p-2 bg-background/30 rounded text-xs"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span>{getRouteEmoji(decision.route)}</span>
                        <span className="truncate text-muted-foreground">
                          {decision.insight}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <div className="flex items-center space-x-1">
                          <Star className="w-2 h-2 text-yellow-500" />
                          <span className="text-muted-foreground">{decision.confidence}%</span>
                        </div>
                        <span className="text-muted-foreground">
                          {formatTimeAgo(decision.timestamp)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-2 bg-muted/30 border border-dashed border-border rounded">
                  No recent navigation decisions recorded
                </div>
              )}
            </section>

            {/* Processing Power Indicator */}
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Cortex Processing Power</span>
                <span className="font-medium">{processingPower}%</span>
              </div>
              <div 
                className="bg-muted rounded-full h-1" 
                role="progressbar" 
                aria-valuenow={processingPower} 
                aria-valuemin={0} 
                aria-valuemax={100}
                aria-label={`Cortex processing power: ${processingPower} percent`}
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  initial={shouldReduceMotion ? { width: `${processingPower}%` } : { width: 0 }}
                  animate={{ width: `${processingPower}%` }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 