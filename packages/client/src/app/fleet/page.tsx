'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { toast } from 'sonner';

export default function ShipsPage() {
  const searchParams = useSearchParams();
  const { restoreSession, updateStep } = useOnboardingSession();
  const [shouldOpenCreate, setShouldOpenCreate] = useState(false);
  
  useEffect(() => {
    // Check URL params with multiple methods
    const isOnboardingFromSearchParams = searchParams.get('onboarding') === 'true';
    const isResumedFromSearchParams = searchParams.get('resumed') === 'true';
    
    // Fallback: Check window.location directly
    const urlParams = new URLSearchParams(window.location.search);
    const isOnboardingFromWindow = urlParams.get('onboarding') === 'true';
    const isResumedFromWindow = urlParams.get('resumed') === 'true';
    
    const isOnboarding = isOnboardingFromSearchParams || isOnboardingFromWindow;
    const isResumed = isResumedFromSearchParams || isResumedFromWindow;
    
    // Alternative: Check if there's a pending vision session regardless of URL params
    let hasPendingVisionSession = false;
    try {
      const stored = localStorage.getItem('onboarding_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.data?.pendingVision && parsed?.data?.isOnboarding) {
          hasPendingVisionSession = true;
        }
      }
    } catch (e) {
      console.error('[Fleet] Failed to check for pending vision:', e);
    }
    
    console.log('[Fleet] Onboarding check:', { 
      isOnboarding, 
      isResumed,
      hasPendingVisionSession,
      searchParamsValue: searchParams.toString(),
      windowLocationSearch: window.location.search 
    });
    
    // Check both URL params and session existence
    if (isOnboarding || hasPendingVisionSession) {
      // Try to restore the session
      let restoredSession = restoreSession();
      console.log('[Fleet] Restored session from hook:', restoredSession);
      
      // Fallback: Try to get directly from localStorage if hook fails
      if (!restoredSession) {
        try {
          const stored = localStorage.getItem('onboarding_session');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.data) {
              restoredSession = parsed.data;
              console.log('[Fleet] Restored session from localStorage fallback:', restoredSession);
            }
          }
        } catch (e) {
          console.error('[Fleet] Failed to parse localStorage fallback:', e);
        }
      }
      
      if (restoredSession && restoredSession.pendingVision) {
        // Only update step if not already set to avoid re-renders
        if (restoredSession.onboardingStep !== 'creation') {
          updateStep('creation');
        }
        setShouldOpenCreate(true);
        
        console.log('[Fleet] Opening create modal with vision:', restoredSession.pendingVision?.slice(0, 50));
        
        // Show a welcome back message if resumed
        if (isResumed) {
          toast.success('Welcome back! Let\'s continue creating your starship.', {
            description: `Vision: "${restoredSession.pendingVision?.slice(0, 50) || 'Your vision'}..."`,
            duration: 5000,
          });
        } else {
          // Show vision confirmation toast
          toast.success('Vision captured! Let\'s create your starship.', {
            description: `"${restoredSession.pendingVision?.slice(0, 50) || 'Your vision'}..."`,
            duration: 5000,
          });
        }
      } else if ((isOnboarding || hasPendingVisionSession) && !restoredSession) {
        // User came through onboarding flow but no session found
        // This could happen if session expired or was cleared
        console.log('[Fleet] No session found in any storage, opening empty create modal');
        
        // Log what's in storage for debugging
        console.log('[Fleet] localStorage keys:', Object.keys(localStorage));
        console.log('[Fleet] sessionStorage keys:', Object.keys(sessionStorage));
        
        toast.info('Let\'s create your first starship!');
        setShouldOpenCreate(true);
      }
    }
    // Remove restoreSession and updateStep from dependencies to avoid infinite loop
  }, [searchParams]);
  
  return (
    <AuthGate>
      <div className="h-screen w-screen overflow-hidden">
        <StarshipDashboard autoOpenCreate={shouldOpenCreate} />
      </div>
    </AuthGate>
  );
}