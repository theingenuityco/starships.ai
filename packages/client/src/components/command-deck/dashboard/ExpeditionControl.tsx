import { useStarshipStore } from '@/store/starship-store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ExpeditionControl() {
  const { activeStarshipId, starshipAgents } = useStarshipStore();
  const deployedAgents = activeStarshipId ? starshipAgents[activeStarshipId]?.deployedCount ?? 0 : 0;
  
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Deployed Agents</h3>
        <Badge variant="secondary">{deployedAgents} Active</Badge>
      </div>
      <div className="space-y-3">
        <div className="p-3 border rounded-lg">
          <div className="font-medium">Analysis Agent</div>
          <div className="text-sm text-muted-foreground">Processing data insights</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs">Active</span>
          </div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="font-medium">Support Agent</div>
          <div className="text-sm text-muted-foreground">Handling user queries</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-xs">Standby</span>
          </div>
        </div>
      </div>
    </Card>
  );
} 