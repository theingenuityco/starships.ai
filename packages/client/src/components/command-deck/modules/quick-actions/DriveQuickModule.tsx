import { Zap, AlertTriangle, Gauge } from 'lucide-react';

interface DriveQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function DriveQuickModule({ data: _data, onAction }: DriveQuickModuleProps) {
  const thrusterPower = 78;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Drive Status</span>
        <div className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
          <span className="text-xs text-yellow-600 dark:text-yellow-400">Warning</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Thruster Power</span>
        <span className="text-sm font-mono">{thrusterPower}%</span>
      </div>
      
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => onAction('run-diagnostics')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Gauge className="w-3 h-3" />
          Check Systems
        </button>
      </div>
    </div>
  );
} 