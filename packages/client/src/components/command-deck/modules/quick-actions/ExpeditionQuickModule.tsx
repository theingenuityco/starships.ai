import { Rocket, Clock, Target, Calendar } from 'lucide-react';
import { useExpeditionData } from '@/hooks/useExpeditionData';
import { useRouter } from 'next/navigation';

interface ExpeditionQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function ExpeditionQuickModule({ data, onAction }: ExpeditionQuickModuleProps) {
  const router = useRouter();
  const { starshipId, starshipSlug } = data;
  
  // Get real expedition data
  const {
    expeditions,
    stats,
    activeExpeditions
  } = useExpeditionData({
    starshipId,
    autoRefresh: false,
    enableWebSocket: true
  });

  // Calculate real mission data
  const activeMissions = (activeExpeditions || []).slice(0, 2).map(exp => ({
    name: exp.name || 'Unnamed Mission',
    progress: Math.round(Math.random() * 100) // TODO: Calculate real progress
  }));
  
  const totalMissions = stats?.totalExpeditions || 0;
  const activeCount = stats?.activeExpeditions || 0;
  const completedCount = stats?.completedExpeditions || 0;

  return (
    <div className="space-y-3">
      {/* Active Missions Count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Active Missions</span>
        <div className="flex items-center gap-1">
          <Rocket className="w-3 h-3 text-blue-500" />
          <span className="text-sm font-mono">{activeCount}/{totalMissions}</span>
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

      {/* Mission Stats */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Success Rate</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-orange-500" />
          <span className="text-xs text-orange-600 dark:text-orange-400">
            {totalMissions > 0 ? Math.round((completedCount / totalMissions) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Mission Stats */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-1.5 bg-blue-500/10 rounded text-xs">
          <div className="text-blue-600 dark:text-blue-400 font-mono">{activeCount}</div>
          <div className="text-muted-foreground">Active</div>
        </div>
        <div className="p-1.5 bg-green-500/10 rounded text-xs">
          <div className="text-green-600 dark:text-green-400 font-mono">{completedCount}</div>
          <div className="text-muted-foreground">Completed</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => {
            if (starshipSlug) {
              router.push(`/ship/${starshipSlug}/expeditions`);
            } else {
              onAction('plan-mission');
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Calendar className="w-3 h-3" />
          Launch Expedition
        </button>
      </div>
    </div>
  );
} 