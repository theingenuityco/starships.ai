'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home, ArrowRight } from 'lucide-react';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { useRouter } from 'next/navigation';

interface ErrorRecoveryProps {
  error: string;
  canRetry?: boolean;
  onRetry?: () => void;
  onReset?: () => void;
}

export function ErrorRecovery({ 
  error, 
  canRetry = true, 
  onRetry, 
  onReset 
}: ErrorRecoveryProps) {
  const { session, restoreSession, clearSession } = useOnboardingSession();
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const router = useRouter();

  const handleRecovery = async () => {
    setIsRecovering(true);
    setRecoveryAttempts(prev => prev + 1);

    try {
      // Try to restore session
      const restored = restoreSession();
      
      if (restored && restored.pendingVision) {
        // Session restored successfully
        if (onRetry) {
          onRetry();
        } else {
          // Redirect to continue flow
          router.push('/fleet?onboarding=true');
        }
      } else {
        // No session to restore, start fresh
        handleReset();
      }
    } catch (err) {
      console.error('Recovery failed:', err);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleReset = () => {
    clearSession();
    if (onReset) {
      onReset();
    } else {
      router.push('/');
    }
  };

  const getErrorMessage = () => {
    if (error.includes('auth')) {
      return 'Authentication failed. Please try signing in again.';
    }
    if (error.includes('storage')) {
      return 'Unable to save your progress. Please check your browser settings.';
    }
    if (error.includes('network')) {
      return 'Connection lost. Please check your internet and try again.';
    }
    return error;
  };

  const getSuggestion = () => {
    if (recoveryAttempts > 2) {
      return 'Multiple recovery attempts failed. Consider starting fresh.';
    }
    if (session?.pendingVision) {
      return 'Your vision has been saved. You can continue where you left off.';
    }
    return 'You can retry the operation or start over.';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      >
        <Card className="max-w-md w-full p-6 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-semibold">Something went wrong</h3>
              <p className="text-sm text-muted-foreground">
                {getErrorMessage()}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {getSuggestion()}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {canRetry && recoveryAttempts < 3 && (
              <Button
                onClick={handleRecovery}
                disabled={isRecovering}
                className="flex-1"
              >
                {isRecovering ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Recovering...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </>
                )}
              </Button>
            )}
            
            {session?.pendingVision && (
              <Button
                variant="outline"
                onClick={() => router.push('/fleet?onboarding=true')}
                className="flex-1"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue
              </Button>
            )}
            
            <Button
              variant="ghost"
              onClick={handleReset}
              className="flex-1"
            >
              <Home className="w-4 h-4 mr-2" />
              Start Over
            </Button>
          </div>

          {recoveryAttempts > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Recovery attempts: {recoveryAttempts}/3
            </p>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook for error boundary integration
export function useErrorRecovery() {
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const handleError = (error: Error | string) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    setError(errorMessage);
    setShowRecovery(true);
    
    // Log to console for debugging
    console.error('[Error Recovery]', error);
  };

  const clearError = () => {
    setError(null);
    setShowRecovery(false);
  };

  return {
    error,
    showRecovery,
    handleError,
    clearError,
    ErrorRecoveryComponent: showRecovery ? (
      <ErrorRecovery
        error={error || 'An unexpected error occurred'}
        onRetry={clearError}
        onReset={clearError}
      />
    ) : null
  };
}