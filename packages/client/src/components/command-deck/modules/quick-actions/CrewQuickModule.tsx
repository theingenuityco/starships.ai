import { Users, UserCheck, AlertCircle, Plus } from 'lucide-react';

interface CrewQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function CrewQuickModule({ data, onAction }: CrewQuickModuleProps) {
  // Mock crew data - replace with real crew data from store
  // TODO: Replace with actual crew metrics from backend
  const totalCrew = 15;
  const activeCrew = 12;
  const onMission = 3;
  const needsAttention = 1;

  return (
    <div className="space-y-3">
      {/* Active Crew */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Active Crew</span>
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-blue-500" />
          <span className="text-sm font-mono">{activeCrew}/{totalCrew}</span>
        </div>
      </div>

      {/* On Mission */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">On Mission</span>
        <div className="flex items-center gap-1">
          <UserCheck className="w-3 h-3 text-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">{onMission} deployed</span>
        </div>
      </div>

      {/* Needs Attention */}
      {needsAttention > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Alerts</span>
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-yellow-500" />
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              {needsAttention} requires attention
            </span>
          </div>
        </div>
      )}

      {/* Crew Status Overview */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="p-1 bg-green-500/10 rounded text-xs">
          <div className="text-green-600 dark:text-green-400 font-mono">{activeCrew}</div>
          <div className="text-muted-foreground">Ready</div>
        </div>
        <div className="p-1 bg-blue-500/10 rounded text-xs">
          <div className="text-blue-600 dark:text-blue-400 font-mono">{onMission}</div>
          <div className="text-muted-foreground">Mission</div>
        </div>
        <div className="p-1 bg-gray-500/10 rounded text-xs">
          <div className="text-muted-foreground font-mono">{totalCrew - activeCrew}</div>
          <div className="text-muted-foreground">Rest</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50 space-y-1">
        <button
          onClick={() => onAction('assign-tasks')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Plus className="w-3 h-3" />
          Assign Tasks
        </button>
      </div>
    </div>
  );
} 