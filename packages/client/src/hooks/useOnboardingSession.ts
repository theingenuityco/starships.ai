'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  OnboardingSession, 
  VisionAnalysis, 
  OnboardingStep,
  StorageSchema 
} from '@/lib/onboarding/types';
import { 
  storeSession, 
  retrieveSession, 
  clearSession,
  generateSessionId 
} from '@/lib/onboarding/storage';

export function useOnboardingSession() {
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Load session on mount
  useEffect(() => {
    const stored = retrieveSession();
    if (stored) {
      // Check if expired
      const now = Date.now();
      if (stored.metadata.expiresAt < now) {
        setIsExpired(true);
        clearSession();
      } else {
        setSession(stored.data);
      }
    }
  }, []);

  // Save vision to session
  const saveVision = useCallback((vision: string, analysis: VisionAnalysis) => {
    const newSession: OnboardingSession = {
      pendingVision: vision,
      visionAnalysis: analysis,
      isOnboarding: true,
      onboardingStep: 'vision',
      startedAt: Date.now(),
      sibilSessionId: generateSessionId(),
      sibilMessages: [
        {
          role: 'user',
          content: vision,
          timestamp: Date.now()
        },
        {
          role: 'assistant',
          content: analysis.summary || 'Great vision! Let\'s create your starship.',
          timestamp: Date.now()
        }
      ],
      lastError: null,
      retryCount: 0
    };

    setSession(newSession);
    storeSession(newSession);
  }, []);

  // Update onboarding step
  const updateStep = useCallback((step: OnboardingStep) => {
    if (!session) return;

    const updated = {
      ...session,
      onboardingStep: step
    };

    setSession(updated);
    storeSession(updated);
  }, [session]);

  // Clear session
  const clear = useCallback(() => {
    setSession(null);
    clearSession();
  }, []);

  // Restore session from storage
  const restoreSession = useCallback((): OnboardingSession | null => {
    const stored = retrieveSession();
    if (stored && stored.metadata.expiresAt > Date.now()) {
      setSession(stored.data);
      return stored.data;
    }
    return null;
  }, []);

  // Handle cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'onboarding_session') {
        if (e.newValue) {
          try {
            const parsed: StorageSchema = JSON.parse(e.newValue);
            if (parsed.metadata.expiresAt > Date.now()) {
              setSession(parsed.data);
            }
          } catch (err) {
            console.error('Failed to parse session from storage event:', err);
          }
        } else {
          // Session was cleared in another tab
          setSession(null);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Auto-cleanup expired sessions
  useEffect(() => {
    const interval = setInterval(() => {
      const stored = retrieveSession();
      if (stored && stored.metadata.expiresAt < Date.now()) {
        clearSession();
        setSession(null);
        setIsExpired(true);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return {
    session,
    saveVision,
    updateStep,
    clearSession: clear,
    restoreSession,
    isExpired
  };
}