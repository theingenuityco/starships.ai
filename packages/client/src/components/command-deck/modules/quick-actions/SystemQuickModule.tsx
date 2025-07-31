import { Activity, Zap, Shield, Gauge } from 'lucide-react';

interface SystemQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function SystemQuickModule({ data, onAction }: SystemQuickModuleProps) {
  const { powerLevel, sibilInsights } = data;
  const systemHealth = 92;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">System Health</span>
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-green-500" />
          <span className="text-sm font-mono">{systemHealth}%</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-1 text-center">
        <div className="p-1 bg-blue-500/10 rounded text-xs">
          <div className="text-blue-600 dark:text-blue-400 font-mono">{powerLevel}%</div>
          <div className="text-muted-foreground">Power</div>
        </div>
        <div className="p-1 bg-purple-500/10 rounded text-xs">
          <div className="text-purple-600 dark:text-purple-400 font-mono">{sibilInsights}</div>
          <div className="text-muted-foreground">Insights</div>
        </div>
      </div>
      
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => onAction('system-overview')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Gauge className="w-3 h-3" />
          Full Overview
        </button>
      </div>
    </div>
  );
} 