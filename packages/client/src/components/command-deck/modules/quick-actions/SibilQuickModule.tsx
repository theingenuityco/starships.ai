import { Brain, TrendingUp, Lightbulb, Zap } from 'lucide-react';

interface SibilQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function SibilQuickModule({ data, onAction }: SibilQuickModuleProps) {
  const { sibilInsights } = data;
  
  // Mock AI data - replace with real AI data
  const newPredictions = 3;
  const confidence = 94;
  const recommendations = 2;
  const processingActive = true;

  return (
    <div className="space-y-3">
      {/* AI Status */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">AI Status</span>
        <div className="flex items-center gap-1">
          {processingActive ? (
            <>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-xs text-purple-600 dark:text-purple-400">Analyzing</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 bg-gray-400 rounded-full" />
              <span className="text-xs text-muted-foreground">Standby</span>
            </>
          )}
        </div>
      </div>

      {/* Confidence Level */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-mono">{confidence}%</span>
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${confidence > 90 ? 'bg-green-500' : confidence > 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* New Insights */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">New Insights</span>
        <div className="flex items-center gap-1">
          <Lightbulb className="w-3 h-3 text-yellow-500" />
          <span className="text-xs text-yellow-600 dark:text-yellow-400">{sibilInsights} available</span>
        </div>
      </div>

      {/* AI Metrics */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="p-1 bg-purple-500/10 rounded text-xs">
          <div className="text-purple-600 dark:text-purple-400 font-mono">{newPredictions}</div>
          <div className="text-muted-foreground">Predict</div>
        </div>
        <div className="p-1 bg-yellow-500/10 rounded text-xs">
          <div className="text-yellow-600 dark:text-yellow-400 font-mono">{sibilInsights}</div>
          <div className="text-muted-foreground">Insights</div>
        </div>
        <div className="p-1 bg-green-500/10 rounded text-xs">
          <div className="text-green-600 dark:text-green-400 font-mono">{recommendations}</div>
          <div className="text-muted-foreground">Suggest</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={() => onAction('generate-vision')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Zap className="w-3 h-3" />
          Generate Vision
        </button>
      </div>
    </div>
  );
} 