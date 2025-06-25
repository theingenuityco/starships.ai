import { Rocket, Clock, Target, Calendar } from 'lucide-react';

interface ExpeditionQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function ExpeditionQuickModule({ data, onAction }: ExpeditionQuickModuleProps) {
  const { activeExpeditions } = data;
  
  // Mock mission data - replace with real mission data
  const activeMissions = [
    { name: 'Deep Space Survey', progress: 67 },
    { name: 'Lunar Mining', progress: 23 }
  ];
  const nextLaunch = '2h 14m';
  const totalMissions = 5;

  return (
    <div className="space-y-3">
      {/* Active Missions Count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Active Missions</span>
        <div className="flex items-center gap-1">
          <Rocket className="w-3 h-3 text-blue-500" />
          <span className="text-sm font-mono">{activeMissions.length}/{totalMissions}</span>
        </div>
      </div>

      {/* Mission Progress */}
      <div className="space-y-2">
        {activeMissions.slice(0, 2).map((mission, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground truncate">{mission.name}</span>
              <span className="text-xs font-mono">{mission.progress}%</span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${mission.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Next Launch */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Next Launch</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-orange-500" />
          <span className="text-xs text-orange-600 dark:text-orange-400">{nextLaunch}</span>
        </div>
      </div>

      {/* Mission Stats */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-1.5 bg-blue-500/10 rounded text-xs">
          <div className="text-blue-600 dark:text-blue-400 font-mono">{activeMissions.length}</div>
          <div className="text-muted-foreground">Active</div>
        </div>
        <div className="p-1.5 bg-green-500/10 rounded text-xs">
          <div className="text-green-600 dark:text-green-400 font-mono">2</div>
          <div className="text-muted-foreground">Completed</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => onAction('plan-mission')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Calendar className="w-3 h-3" />
          Plan Mission
        </button>
      </div>
    </div>
  );
} 