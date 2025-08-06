import { Brain, TrendingUp, Lightbulb, Zap, Eye, Target, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import SocketClient from '@/lib/socket-client';
import { useAuth } from '@/hooks/useAuth';
import type { 
  VisionAnalyzingEventData, 
  VisionProposalEventData, 
  VisionUpdatedEventData,
  VisionMetrics
} from '@starships/protocol';

interface SibilQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function SibilQuickModule({ data, onAction }: SibilQuickModuleProps) {
  const { sibilInsights, activeStarshipId } = data;
  const { user } = useAuth();
  
  // Vision refinement state
  const [visionBeingRefined, setVisionBeingRefined] = useState(false);
  const [visionQualityScore, setVisionQualityScore] = useState<number | null>(null);
  const [hasPendingProposal, setHasPendingProposal] = useState(false);
  const [refinementCount, setRefinementCount] = useState(0);
  
  // Socket client reference
  const socketClient = useRef<SocketClient | null>(null);
  const isSocketSetup = useRef(false);
  
  // Setup socket listeners for vision refinement
  const setupVisionListeners = useCallback(() => {
    if (!activeStarshipId || !user?.id || isSocketSetup.current) return;
    
    const socket = SocketClient.getInstance();
    socketClient.current = socket;
    
    socket.on('vision:analyzing', (data: VisionAnalyzingEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setVisionBeingRefined(true);
        setHasPendingProposal(false);
      }
    });
    
    socket.on('vision:analysis-complete', (data: any) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setVisionBeingRefined(false);
        setVisionQualityScore(data.analysis.metrics.overallQuality);
      }
    });
    
    socket.on('vision:proposal', (data: VisionProposalEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setVisionBeingRefined(false);
        setHasPendingProposal(true);
        setVisionQualityScore(data.proposal.metrics.overallQuality);
      }
    });
    
    socket.on('vision:updated', (data: VisionUpdatedEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setHasPendingProposal(false);
        setVisionQualityScore(data.metrics.overallQuality);
        setRefinementCount(data.refinementCount);
      }
    });
    
    socket.on('vision:error', (data: any) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setVisionBeingRefined(false);
      }
    });
    
    isSocketSetup.current = true;
  }, [activeStarshipId, user?.id]);
  
  // Cleanup socket listeners
  const cleanupVisionListeners = useCallback(() => {
    if (!socketClient.current) return;
    
    socketClient.current.off('vision:analyzing');
    socketClient.current.off('vision:analysis-complete');
    socketClient.current.off('vision:proposal');
    socketClient.current.off('vision:updated');
    socketClient.current.off('vision:error');
    
    isSocketSetup.current = false;
  }, []);
  
  // Setup listeners when component mounts
  useEffect(() => {
    if (activeStarshipId && user?.id) {
      setupVisionListeners();
    }
    
    return () => {
      cleanupVisionListeners();
    };
  }, [activeStarshipId, user?.id, setupVisionListeners, cleanupVisionListeners]);
  
  // Mock AI data - replace with real AI data
  const newPredictions = 3;
  const confidence = 94;
  const recommendations = 2;
  const processingActive = visionBeingRefined || true;

  return (
    <div className="space-y-3">
      {/* Vision Refinement Status */}
      {visionBeingRefined && (
        <div className="flex items-center justify-between mb-2 p-2 bg-purple-500/10 rounded">
          <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Vision Status</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-xs text-purple-600 dark:text-purple-400">Refining</span>
          </div>
        </div>
      )}
      
      {hasPendingProposal && (
        <div className="flex items-center justify-between mb-2 p-2 bg-blue-500/10 rounded">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Vision Status</span>
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-blue-500" />
            <span className="text-xs text-blue-600 dark:text-blue-400">Proposal Ready</span>
          </div>
        </div>
      )}

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

      {/* Vision Quality Score */}
      {visionQualityScore !== null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Vision Quality</span>
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3 text-green-500" />
            <span className={`text-xs font-mono ${
              visionQualityScore >= 80 ? 'text-green-600 dark:text-green-400' :
              visionQualityScore >= 60 ? 'text-blue-600 dark:text-blue-400' :
              visionQualityScore >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {visionQualityScore}/100
            </span>
          </div>
        </div>
      )}

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
          <div className="text-green-600 dark:text-green-400 font-mono">{refinementCount}</div>
          <div className="text-muted-foreground">Refined</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/50 space-y-2">
        {hasPendingProposal && (
          <button
            onClick={() => onAction('review-vision-proposal')}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded text-xs transition-colors"
          >
            <Target className="w-3 h-3" />
            Review Proposal
          </button>
        )}
        
        <button
          onClick={() => onAction('refine-vision')}
          disabled={visionBeingRefined}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Eye className="w-3 h-3" />
          {visionBeingRefined ? 'Refining...' : 'Analyze Vision'}
        </button>
        
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