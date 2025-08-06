'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Brain, Target, Sparkles, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SocketClient from '@/lib/socket-client';
import { useAuth } from '@/hooks/useAuth';
import type { 
  VisionAnalyzingEventData, 
  VisionProposalEventData, 
  VisionUpdatedEventData,
  VisionRefinementProposal,
  VisionMetrics 
} from '@starships/protocol';

interface VisionChatContextIndicatorProps {
  starshipId?: string;
  onVisionProposalAction?: (action: 'accept' | 'reject', proposal?: VisionRefinementProposal) => void;
  className?: string;
}

type VisionContextState = 
  | { type: 'none' }
  | { type: 'analyzing'; vision: string }
  | { type: 'proposal_ready'; proposal: VisionRefinementProposal }
  | { type: 'updated'; oldVision: string; newVision: string; metrics: VisionMetrics };

export function VisionChatContextIndicator({ 
  starshipId, 
  onVisionProposalAction,
  className = "" 
}: VisionChatContextIndicatorProps) {
  const { user } = useAuth();
  const [contextState, setContextState] = useState<VisionContextState>({ type: 'none' });
  const [sessionId, setSessionId] = useState<string>();
  
  const socketClient = useRef<SocketClient | null>(null);
  const isSocketSetup = useRef(false);

  // Setup socket listeners
  const setupSocketListeners = useCallback(() => {
    if (!starshipId || !user?.id || isSocketSetup.current) return;
    
    const socket = SocketClient.getInstance();
    socketClient.current = socket;
    
    socket.on('vision:analyzing', (data: VisionAnalyzingEventData) => {
      if (data.starshipId === starshipId && data.userId === user.id) {
        setContextState({ 
          type: 'analyzing', 
          vision: data.vision 
        });
        setSessionId(data.sessionId);
      }
    });
    
    socket.on('vision:proposal', (data: VisionProposalEventData) => {
      if (data.starshipId === starshipId && data.userId === user.id) {
        setContextState({ 
          type: 'proposal_ready', 
          proposal: data.proposal 
        });
        setSessionId(data.sessionId);
      }
    });
    
    socket.on('vision:updated', (data: VisionUpdatedEventData) => {
      if (data.starshipId === starshipId && data.userId === user.id) {
        setContextState({
          type: 'updated',
          oldVision: data.oldVision,
          newVision: data.newVision,
          metrics: data.metrics
        });
        
        // Auto-hide update notification after 5 seconds
        setTimeout(() => {
          setContextState({ type: 'none' });
        }, 5000);
      }
    });
    
    socket.on('vision:error', (data: any) => {
      if (data.starshipId === starshipId && data.userId === user.id) {
        setContextState({ type: 'none' });
      }
    });
    
    isSocketSetup.current = true;
  }, [starshipId, user?.id]);

  // Cleanup socket listeners
  const cleanupSocketListeners = useCallback(() => {
    if (!socketClient.current) return;
    
    socketClient.current.off('vision:analyzing');
    socketClient.current.off('vision:proposal');
    socketClient.current.off('vision:updated');
    socketClient.current.off('vision:error');
    
    isSocketSetup.current = false;
  }, []);

  useEffect(() => {
    if (starshipId && user?.id) {
      setupSocketListeners();
    }
    
    return () => {
      cleanupSocketListeners();
    };
  }, [starshipId, user?.id, setupSocketListeners, cleanupSocketListeners]);

  const handleAcceptProposal = () => {
    if (contextState.type === 'proposal_ready' && sessionId && socketClient.current) {
      socketClient.current.emit('vision:accept-proposal', {
        starshipId: starshipId!,
        sessionId,
        userId: user!.id
      });
      
      onVisionProposalAction?.('accept', contextState.proposal);
      setContextState({ type: 'none' });
    }
  };

  const handleRejectProposal = () => {
    if (contextState.type === 'proposal_ready' && sessionId && socketClient.current) {
      socketClient.current.emit('vision:reject-proposal', {
        starshipId: starshipId!,
        sessionId,
        userId: user!.id
      });
      
      onVisionProposalAction?.('reject', contextState.proposal);
      setContextState({ type: 'none' });
    }
  };

  const handleDismiss = () => {
    setContextState({ type: 'none' });
  };

  if (contextState.type === 'none') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className={`mb-4 ${className}`}
      >
        {contextState.type === 'analyzing' && (
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="animate-spin">
                  <Brain className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">
                      Analyzing Vision Statement
                    </h4>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-purple-500" />
                      <span className="text-xs text-purple-600 dark:text-purple-400">
                        In progress...
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-purple-600 dark:text-purple-400 mb-2">
                    Sibil is analyzing your vision for clarity, specificity, and actionability.
                  </p>
                  <div className="text-xs text-purple-500 font-mono bg-purple-500/5 p-2 rounded border">
                    {contextState.vision.slice(0, 100)}
                    {contextState.vision.length > 100 ? '...' : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-purple-500 hover:bg-purple-500/10 p-1 h-6 w-6"
                >
                  <XCircle className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {contextState.type === 'proposal_ready' && (
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Vision Refinement Ready
                      </h4>
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          {contextState.proposal.confidenceLevel}% confidence
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      {contextState.proposal.reasoning}
                    </p>
                    
                    <div className="bg-blue-500/5 p-3 rounded border border-blue-500/10 mb-3">
                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                        Proposed Vision:
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        {contextState.proposal.proposedVision}
                      </div>
                    </div>
                    
                    {contextState.proposal.keyChanges.length > 0 && (
                      <div className="space-y-1 mb-3">
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                          Key Changes:
                        </div>
                        <ul className="space-y-1">
                          {contextState.proposal.keyChanges.slice(0, 2).map((change, index) => (
                            <li key={index} className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-2">
                              <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                              {change}
                            </li>
                          ))}
                          {contextState.proposal.keyChanges.length > 2 && (
                            <li className="text-xs text-blue-500 italic">
                              +{contextState.proposal.keyChanges.length - 2} more changes
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="text-blue-500 hover:bg-blue-500/10 p-1 h-6 w-6"
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
                
                <div className="flex gap-2 pt-1 border-t border-blue-500/10">
                  <Button
                    size="sm"
                    onClick={handleAcceptProposal}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRejectProposal}
                    className="text-blue-600 border-blue-500/20 hover:bg-blue-500/5"
                  >
                    Keep Current
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {contextState.type === 'updated' && (
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-300">
                      Vision Updated Successfully
                    </h4>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        Quality: {contextState.metrics.overallQuality}/100
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Your starship's vision has been successfully updated with the refined version.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-green-500 hover:bg-green-500/10 p-1 h-6 w-6"
                >
                  <XCircle className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </AnimatePresence>
  );
}