import { Users, UserCheck, AlertCircle, Plus, Shield } from 'lucide-react'

interface CrewQuickModuleProps {
  data: any
  onAction: (action: string, data?: any) => void
}

export function CrewQuickModule({ data, onAction }: CrewQuickModuleProps) {
  // Mock crew data - replace with real crew data from store
  // TODO: Replace with actual crew metrics from backend
  const totalCrew = 15
  const activeCrew = 12
  const onMission = 3
  const needsAttention = 1

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <span className="text-sm font-medium flex items-center">
          <Shield className="w-4 h-4 mr-1.5 text-primary" />
          Crew Status
        </span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          {activeCrew}/{totalCrew} Active
        </span>
      </div>

      {/* Active Crew */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Active Crew</span>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-sm font-mono">
            {activeCrew}/{totalCrew}
          </span>
        </div>
      </div>

      {/* On Mission */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">On Mission</span>
        <div className="flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">{onMission} deployed</span>
        </div>
      </div>

      {/* Needs Attention */}
      {needsAttention > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Alerts</span>
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              {needsAttention} requires attention
            </span>
          </div>
        </div>
      )}

      {/* Crew Status Overview */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-green-500/10 rounded-md text-xs">
          <div className="text-green-600 dark:text-green-400 font-mono text-sm">{activeCrew}</div>
          <div className="text-muted-foreground">Ready</div>
        </div>
        <div className="p-2 bg-blue-500/10 rounded-md text-xs">
          <div className="text-blue-600 dark:text-blue-400 font-mono text-sm">{onMission}</div>
          <div className="text-muted-foreground">Mission</div>
        </div>
        <div className="p-2 bg-gray-500/10 rounded-md text-xs">
          <div className="text-muted-foreground font-mono text-sm">{totalCrew - activeCrew}</div>
          <div className="text-muted-foreground">Rest</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-3 border-t border-border/50 space-y-2">
        <button
          onClick={() => onAction('assign-tasks')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Assign Tasks
        </button>
      </div>
    </div>
  )
}
