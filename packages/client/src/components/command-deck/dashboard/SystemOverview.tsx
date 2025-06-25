import { useStarshipStore } from '@/store/starship-store';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function SystemOverview() {
  const { powerLevel, class: starshipClass } = useStarshipStore();
  
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">System Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Power Level</div>
          <div className="flex items-center gap-2 mt-1">
            <Progress value={powerLevel} className="flex-1" />
            <span className="text-sm font-mono">{powerLevel}%</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Ship Class</div>
          <div className="font-semibold capitalize mt-1">{starshipClass}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="font-semibold text-green-600 mt-1">Operational</div>
        </div>
      </div>
    </Card>
  );
} 