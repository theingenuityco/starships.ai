import { useStarshipStore } from '@/store/starship-store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ExpeditionControl() {
  const { activeExpeditions } = useStarshipStore();
  
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Expeditions</h3>
        <Badge variant="secondary">{activeExpeditions} Active</Badge>
      </div>
      <div className="space-y-3">
        <div className="p-3 border rounded-lg">
          <div className="font-medium">Exploration Alpha</div>
          <div className="text-sm text-muted-foreground">Charting unknown sectors</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs">In Progress</span>
          </div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="font-medium">Resource Gathering</div>
          <div className="text-sm text-muted-foreground">Mining asteroids</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-xs">Collecting</span>
          </div>
        </div>
      </div>
    </Card>
  );
} 