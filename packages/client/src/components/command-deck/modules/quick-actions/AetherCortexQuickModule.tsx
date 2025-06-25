import { motion } from 'motion/react';
import { Zap, AlertTriangle, CheckCircle, Settings } from 'lucide-react';

interface AetherCortexQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function AetherCortexQuickModule({ data, onAction }: AetherCortexQuickModuleProps) {
  const { powerLevel } = data;
  
  const systemWarnings = 2; // Mock data - replace with real system data
  const processingActive = powerLevel > 80;

  return (
    <div className="space-y-3">
      {/* Power Level */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Core Power</span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-mono">{powerLevel}%</span>
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${powerLevel > 80 ? 'bg-green-500' : powerLevel > 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${powerLevel}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Processing Status */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Processing</span>
        <div className="flex items-center gap-1">
          {processingActive ? (
            <>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-600 dark:text-green-400">Active</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 bg-gray-400 rounded-full" />
              <span className="text-xs text-muted-foreground">Standby</span>
            </>
          )}
        </div>
      </div>

      {/* System Warnings */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">System Status</span>
        <div className="flex items-center gap-1">
          {systemWarnings > 0 ? (
            <>
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                {systemWarnings} warnings
              </span>
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Optimal</span>
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => onAction('run-diagnostics')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Settings className="w-3 h-3" />
          Run Diagnostics
        </button>
      </div>
    </div>
  );
} 