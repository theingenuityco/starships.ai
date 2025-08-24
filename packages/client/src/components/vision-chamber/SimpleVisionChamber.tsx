'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStarshipStore } from '@/store/starship-store';
import { visionAPI } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Save, Edit, AlertTriangle, Sparkles, Target, Lightbulb, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisionMetricsDisplay } from '@/components/vision/VisionMetricsDisplay';
import SocketClient from '@/lib/socket-client';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import type { 
  VisionMetrics, 
  VisionAnalyzingEventData, 
  VisionProposalEventData, 
  VisionUpdatedEventData,
  VisionRefinementProposal,
  VisionAnalysisEventData,
  VisionRefinementErrorEventData
} from '@starships/protocol';

export function SimpleVisionChamber() {
  const { activeStarshipId } = useStarshipStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [vision, setVision] = useState('');
  const [editingVision, setEditingVision] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Vision refinement state
  const [currentMetrics, setCurrentMetrics] = useState<VisionMetrics | undefined>();
  const [previousMetrics, setPreviousMetrics] = useState<VisionMetrics | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<VisionRefinementProposal | undefined>();
  const [refinementSessionId, setRefinementSessionId] = useState<string | undefined>();
  
  // Socket client reference
  const socketClient = useRef<SocketClient | null>(null);
  const isSocketSetup = useRef(false);

  // Initialize socket connection and listeners
  const setupSocketListeners = useCallback(() => {
    if (!activeStarshipId || !user?.id || isSocketSetup.current) return;
    
    const socket = SocketClient.getInstance();
    socketClient.current = socket;
    
    // Set up vision refinement listeners
    socket.on('vision:analyzing', (data: VisionAnalyzingEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setIsAnalyzing(true);
        setCurrentProposal(undefined);
        setRefinementSessionId(data.sessionId);
        
        toast({
          title: 'Vision Analysis Started',
          description: 'Sibil is analyzing your vision statement...',
          variant: 'default',
          duration: 3000
        });
      }
    });
    
    socket.on('vision:analysis-complete', (data: VisionAnalysisEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setIsAnalyzing(false);
        setPreviousMetrics(currentMetrics);
        setCurrentMetrics(data.analysis.metrics);
        
        toast({
          title: 'Vision Analysis Complete',
          description: `Overall quality score: ${data.analysis.metrics.overallQuality}`,
          variant: 'success',
          duration: 4000
        });
      }
    });
    
    socket.on('vision:proposal', (data: VisionProposalEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setIsAnalyzing(false);
        setCurrentProposal(data.proposal);
        setPreviousMetrics(currentMetrics);
        setCurrentMetrics(data.proposal.metrics);
        
        toast({
          title: 'Vision Refinement Proposal',
          description: 'Sibil has a suggestion to improve your vision statement.',
          variant: 'default',
          duration: 5000
        });
      }
    });
    
    socket.on('vision:updated', (data: VisionUpdatedEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setVision(data.newVision);
        setEditingVision(data.newVision);
        setPreviousMetrics(currentMetrics);
        setCurrentMetrics(data.metrics);
        setCurrentProposal(undefined);
        setIsAnalyzing(false);
        
        const updateSourceText = {
          'user_acceptance': 'Your acceptance of the proposal',
          'direct_update': 'Direct update',
          'chat_integration': 'Chat interaction'
        }[data.updateSource];
        
        toast({
          title: 'Vision Updated',
          description: `Vision successfully updated via ${updateSourceText}.`,
          variant: 'success',
          duration: 4000
        });
      }
    });
    
    socket.on('vision:error', (data: VisionRefinementErrorEventData) => {
      if (data.starshipId === activeStarshipId && data.userId === user.id) {
        setIsAnalyzing(false);
        
        const errorMessages = {
          'ANALYSIS_FAILED': 'Failed to analyze vision statement',
          'REFINEMENT_FAILED': 'Failed to generate refinement proposal',
          'RATE_LIMITED': 'Too many requests. Please wait before trying again.',
          'INVALID_INPUT': 'Invalid vision statement provided',
          'SESSION_EXPIRED': 'Refinement session has expired'
        };
        
        toast({
          title: 'Vision Refinement Error',
          description: errorMessages[data.errorCode] || data.error,
          variant: 'destructive',
          duration: 6000
        });
      }
    });
    
    // Join starship room for vision events
    if (socket.isConnected()) {
      socket.emit('vision:join-starship-room', { starshipId: activeStarshipId, userId: user.id });
    }
    
    isSocketSetup.current = true;
  }, [activeStarshipId, user?.id, currentMetrics, toast]);
  
  // Cleanup socket listeners
  const cleanupSocketListeners = useCallback(() => {
    if (!socketClient.current || !activeStarshipId || !user?.id) return;
    
    socketClient.current.off('vision:analyzing');
    socketClient.current.off('vision:analysis-complete');
    socketClient.current.off('vision:proposal');
    socketClient.current.off('vision:updated');
    socketClient.current.off('vision:error');
    
    // Leave starship room
    if (socketClient.current.isConnected()) {
      socketClient.current.emit('vision:leave-starship-room', { starshipId: activeStarshipId, userId: user.id });
    }
    
    isSocketSetup.current = false;
  }, [activeStarshipId, user?.id]);
  
  // Load vision and setup socket listeners on mount
  useEffect(() => {
    if (activeStarshipId) {
      loadVision();
      setupSocketListeners();
    }
    
    return () => {
      cleanupSocketListeners();
    };
  }, [activeStarshipId, setupSocketListeners, cleanupSocketListeners]);

  // Auto-edit if empty
  useEffect(() => {
    if (vision.trim().length === 0) {
      setIsEditing(true);
    }
  }, [vision]);

  const loadVision = async () => {
    if (!activeStarshipId) return;
    
    setLoading(true);
    try {
      const data = await visionAPI.get(activeStarshipId);
      setVision(data.vision || '');
      setEditingVision(data.vision || '');
    } catch (err) {
      setError('Failed to load vision');
    } finally {
      setLoading(false);
    }
  };

  const saveVision = async () => {
    if (!activeStarshipId || !user?.id) return;
    
    setLoading(true);
    try {
      await visionAPI.save(activeStarshipId, editingVision);
      setVision(editingVision);
      setIsEditing(false);
      setError('');
      
      // Trigger vision analysis after save
      if (socketClient.current && socketClient.current.isConnected()) {
        socketClient.current.emit('vision:analyze', {
          starshipId: activeStarshipId,
          vision: editingVision,
          userId: user.id
        });
      }
      
      toast({
        title: 'Vision Saved',
        description: 'Your vision statement has been saved successfully.',
        variant: 'success'
      });
    } catch (err) {
      setError('Failed to save vision');
      toast({
        title: 'Save Failed',
        description: 'Failed to save your vision statement.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  const acceptProposal = async () => {
    if (!activeStarshipId || !user?.id || !refinementSessionId || !socketClient.current) return;
    
    socketClient.current.emit('vision:accept-proposal', {
      starshipId: activeStarshipId,
      sessionId: refinementSessionId,
      userId: user.id
    }, (response) => {
      if (!response.success) {
        toast({
          title: 'Failed to Accept Proposal',
          description: response.error || 'Unknown error occurred',
          variant: 'destructive'
        });
      }
    });
  };
  
  const rejectProposal = async () => {
    if (!activeStarshipId || !user?.id || !refinementSessionId || !socketClient.current) return;
    
    socketClient.current.emit('vision:reject-proposal', {
      starshipId: activeStarshipId,
      sessionId: refinementSessionId,
      userId: user.id
    }, (response) => {
      if (response.success) {
        setCurrentProposal(undefined);
        toast({
          title: 'Proposal Rejected',
          description: 'The vision refinement proposal has been rejected.',
          variant: 'default'
        });
      } else {
        toast({
          title: 'Failed to Reject Proposal',
          description: response.error || 'Unknown error occurred',
          variant: 'destructive'
        });
      }
    });
  };

  if (!activeStarshipId) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-md w-full bg-card/50 backdrop-blur-sm border-border/50 shadow-xl">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="absolute inset-0 bg-purple-500/10 blur-xl" />
                <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-4 rounded-2xl">
                  <Eye className="w-8 h-8 text-purple-500" />
                </div>
              </div>
              <p className="text-muted-foreground">No active starship selected</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-auto bg-gradient-to-b from-background to-background/95">
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <Card className="bg-red-500/10 border-red-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Vision Metrics Display */}
        {(currentMetrics || isAnalyzing) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <VisionMetricsDisplay
              metrics={currentMetrics}
              previousMetrics={previousMetrics}
              isAnalyzing={isAnalyzing}
            />
          </motion.div>
        )}
        
        {/* Vision Refinement Proposal */}
        {currentProposal && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="bg-blue-500/10 border-blue-500/20">
              <CardHeader className="border-b border-blue-500/20">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 blur-sm" />
                    <div className="relative bg-gradient-to-br from-blue-500/25 to-blue-500/15 p-2 rounded-xl">
                      <Brain className="w-5 h-5 text-blue-500" />
                    </div>
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                      Sibil&apos;s Vision Refinement
                    </CardTitle>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Confidence: {currentProposal.confidenceLevel}% • {currentProposal.keyChanges.length} key changes
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Reasoning</h4>
                    <p className="text-sm text-foreground/90">{currentProposal.reasoning}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Proposed Vision</h4>
                    <div className="p-4 bg-background/50 rounded-lg border border-border/50">
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                        {currentProposal.proposedVision}
                      </p>
                    </div>
                  </div>
                  
                  {currentProposal.keyChanges.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Changes</h4>
                      <ul className="space-y-1">
                        {currentProposal.keyChanges.map((change, index) => (
                          <li key={index} className="text-sm text-foreground/80 flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3 pt-4 border-t border-border/50">
                  <Button
                    onClick={acceptProposal}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Accept Proposal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={rejectProposal}
                    className="hover:bg-muted"
                  >
                    Keep Current
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
        
        {/* Analyzing Indicator */}
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="bg-purple-500/10 border-purple-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin">
                    <Brain className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300 font-medium">
                      Sibil is refining your vision...
                    </p>
                    <p className="text-sm text-purple-600 dark:text-purple-400">
                      Analyzing clarity, specificity, actionability, and inspiration
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-xl">
          <CardHeader className="border-b border-border/40">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-500/10 blur-sm" />
                  <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-2.5 rounded-xl">
                    <Eye className="w-5 h-5 text-purple-500" />
                  </div>
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold">Vision Statement</CardTitle>
                  <p className="text-sm text-muted-foreground">Define your starship&apos;s guiding purpose</p>
                </div>
                
                {!isEditing && vision.trim().length > 0 && (
                  <div className={`flex items-center gap-3 px-6 py-3 rounded-xl ${
                    vision.length > 200 
                      ? 'bg-green-500/10 border border-green-500/20'
                      : vision.length > 80
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    <Sparkles className={`w-6 h-6 ${
                      vision.length > 200 
                        ? 'text-green-500'
                        : vision.length > 80
                        ? 'text-blue-500'
                        : 'text-red-500'
                    }`} />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-muted-foreground leading-none">Vision Clarity</span>
                      <span className={`text-lg font-bold leading-none ${
                        vision.length > 200 
                          ? 'text-green-600 dark:text-green-400'
                          : vision.length > 80
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {vision.length > 200 ? 'Strong' : vision.length > 80 ? 'Good' : 'Weak'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {!isEditing && vision.trim().length > 0 && (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  size="sm"
                  className="hover:bg-purple-500/10 hover:border-purple-500/50"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Vision
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {isEditing ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="relative">
                  <Textarea
                    value={editingVision}
                    onChange={(e) => setEditingVision(e.target.value)}
                    placeholder="Enter your starship's vision statement..."
                    className="min-h-[250px] resize-none bg-background/50 border-border/50 focus:border-purple-500/50 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors text-base leading-relaxed"
                    disabled={loading}
                  />
                  <div className="absolute bottom-2 left-2">
                    <span className={`text-xs font-medium ${
                      editingVision.length > 200 
                        ? 'text-green-600 dark:text-green-400' 
                        : editingVision.length > 80 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      Vision Clarity: {editingVision.length > 200 ? 'Strong' : editingVision.length > 80 ? 'Good' : 'Weak'}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs text-muted-foreground">
                      {editingVision.length} characters
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    onClick={saveVision}
                    disabled={loading || !editingVision.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? 'Saving...' : 'Save Vision'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingVision(vision);
                      setIsEditing(false);
                    }}
                    disabled={loading}
                    className="hover:bg-muted"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {vision.trim().length > 0 ? (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-xl" />
                      <div className="relative min-h-[250px] p-6 bg-gradient-to-br from-background/80 to-background/60 rounded-xl border border-border/50">
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                          {vision}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="min-h-[250px] p-6 bg-muted/30 rounded-xl border border-dashed border-border/50 flex items-center justify-center">
                      <p className="text-muted-foreground italic text-center">
                        No vision statement yet. Click below to create one.
                      </p>
                    </div>
                    
                    <Card className="bg-yellow-500/10 border-yellow-500/20">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                              Vision Statement Required
                            </p>
                            <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                              A vision statement is required before agents can be used. Please create one to enable agent interactions and unlock your starship&apos;s full potential.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}