'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Rocket, Clock, RotateCcw, X } from 'lucide-react';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';

interface ReturnFlowBannerProps {
  onContinue?: () => void;
  onDismiss?: () => void;
  autoShow?: boolean;
}

export function ReturnFlowBanner({ 
  onContinue, 
  onDismiss,
  autoShow = true 
}: ReturnFlowBannerProps) {
  const { session, restoreSession, clearSession, isExpired } = useOnboardingSession();
  const [showBanner, setShowBanner] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check for abandoned session on mount
    if (autoShow) {
      const checkSession = async () => {
        const restored = restoreSession();
        if (restored && restored.pendingVision && !isExpired) {
          // Only show if not on an onboarding page already
          const isOnboardingPage = window.location.search.includes('onboarding=true');
          if (!isOnboardingPage) {
            setShowBanner(true);
          }
        }
      };
      
      // Delay check slightly to avoid flash
      setTimeout(checkSession, 500);
    }
  }, [autoShow, restoreSession, isExpired]);

  const handleContinue = async () => {
    setIsRestoring(true);
    
    try {
      if (onContinue) {
        onContinue();
      } else {
        // Default behavior: redirect to fleet with onboarding flag
        router.push('/fleet?onboarding=true&resumed=true');
      }
    } finally {
      setShowBanner(false);
      setIsRestoring(false);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    clearSession();
    setShowBanner(false);
  };

  const handleStartFresh = () => {
    clearSession();
    setShowBanner(false);
    router.push('/');
  };

  if (!showBanner || !session?.pendingVision) {
    return null;
  }

  const timeAgo = formatDistanceToNow(session.startedAt, { addSuffix: true });
  const visionPreview = session.pendingVision.slice(0, 100) + 
    (session.pendingVision.length > 100 ? '...' : '');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full px-4"
      >
        <Card className="border-primary/50 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Rocket className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Welcome Back!</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    You have an unfinished starship creation
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <Badge variant="secondary" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  Started {timeAgo}
                </Badge>
                {session.onboardingStep && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Step: {session.onboardingStep}
                  </Badge>
                )}
              </div>
              <p className="text-sm italic text-muted-foreground">
                "{visionPreview}"
              </p>
              {session.visionAnalysis?.suggestedName && (
                <p className="text-xs text-muted-foreground mt-2">
                  Suggested name: <span className="font-medium">{session.visionAnalysis.suggestedName}</span>
                </p>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleContinue}
                disabled={isRestoring}
                className="flex-1"
              >
                {isRestoring ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Continue Creation
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleStartFresh}
                className="flex-1"
              >
                Start Fresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook for programmatic return flow detection
export function useReturnFlow() {
  const { session, restoreSession, clearSession, isExpired } = useOnboardingSession();
  const [hasAbandonedSession, setHasAbandonedSession] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkForAbandonedSession = async () => {
      setIsChecking(true);
      try {
        const restored = restoreSession();
        if (restored && restored.pendingVision && !isExpired) {
          setHasAbandonedSession(true);
        } else {
          setHasAbandonedSession(false);
        }
      } finally {
        setIsChecking(false);
      }
    };

    checkForAbandonedSession();
  }, [restoreSession, isExpired]);

  const continueSession = () => {
    if (session) {
      return {
        success: true,
        session,
        redirectUrl: `/fleet?onboarding=true&resumed=true`
      };
    }
    return {
      success: false,
      session: null,
      redirectUrl: null
    };
  };

  const abandonSession = () => {
    clearSession();
    setHasAbandonedSession(false);
  };

  return {
    hasAbandonedSession,
    isChecking,
    session,
    continueSession,
    abandonSession,
    isExpired
  };
}

// Inline return prompt for specific pages
interface InlineReturnPromptProps {
  className?: string;
}

export function InlineReturnPrompt({ className }: InlineReturnPromptProps) {
  const { hasAbandonedSession, session, continueSession, abandonSession, isChecking } = useReturnFlow();
  const router = useRouter();
  
  if (isChecking || !hasAbandonedSession || !session) {
    return null;
  }

  const handleContinue = () => {
    const result = continueSession();
    if (result.success && result.redirectUrl) {
      router.push(result.redirectUrl);
    }
  };

  const visionPreview = session.pendingVision?.slice(0, 50) + 
    (session.pendingVision && session.pendingVision.length > 50 ? '...' : '');

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={className}
    >
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Rocket className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Continue where you left off?</p>
                <p className="text-xs text-muted-foreground">"{visionPreview}"</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={abandonSession}>
                Dismiss
              </Button>
              <Button size="sm" onClick={handleContinue}>
                Continue
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}