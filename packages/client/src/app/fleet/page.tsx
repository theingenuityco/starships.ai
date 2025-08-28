'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { toast } from 'sonner';

export default function ShipsPage() {
  // Check if we need to force reload after auth
  useEffect(() => {
    // Check for auth completion flag
    const checkAuthCompletion = () => {
      if (document.cookie.includes('kinde_auth_completed=true') || 
          document.cookie.includes('kinde_needs_refresh=true')) {
        console.log('[Fleet] Auth completed, forcing page reload to sync state');
        // Clear the flag cookies
        document.cookie = 'kinde_auth_completed=; Max-Age=0; Path=/';
        document.cookie = 'kinde_needs_refresh=; Max-Age=0; Path=/';
        // Force reload to reinitialize Kinde SDK with new auth state
        window.location.reload();
      }
    };
    
    // Check immediately and after a short delay
    checkAuthCompletion();
    const timer = setTimeout(checkAuthCompletion, 500);
    
    return () => clearTimeout(timer);
  }, []);
  const searchParams = useSearchParams();
  const { restoreSession, updateStep, clearSession } = useOnboardingSession();
  const [shouldOpenCreate, setShouldOpenCreate] = useState(false);
  const [hasProcessedOnboarding, setHasProcessedOnboarding] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    // Mark as initialized to ensure component renders
    if (!isInitialized) {
      setIsInitialized(true);
    }
    
    // Skip if we've already processed onboarding
    if (hasProcessedOnboarding) {
      return;
    }
    
    // Small delay to ensure everything is loaded after auth redirect
    const checkOnboarding = () => {
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
      let onboardingCompleted = false;
      
      try {
        const stored = localStorage.getItem('onboarding_session');
        if (stored) {
          const parsed = JSON.parse(stored);
          // Check if onboarding was already completed
          if (parsed?.data?.onboardingStep === 'complete') {
            onboardingCompleted = true;
          } else if (parsed?.data?.pendingVision && parsed?.data?.isOnboarding) {
            hasPendingVisionSession = true;
          }
        }
      } catch (e) {
        console.error('[Fleet] Failed to check for pending vision:', e);
      }
      
      // If onboarding was already completed, clear the session and don't open modal
      if (onboardingCompleted) {
        console.log('[Fleet] Onboarding already completed, clearing session');
        clearSession();
        localStorage.removeItem('onboarding_session');
        return;
      }
      
      console.log('[Fleet] Onboarding check:', { 
        isOnboarding, 
        isResumed,
        hasPendingVisionSession,
        hasProcessedOnboarding,
        searchParamsValue: searchParams.toString(),
        windowLocationSearch: window.location.search 
      });
      
      // Check both URL params and session existence
      if ((isOnboarding || hasPendingVisionSession) && !hasProcessedOnboarding) {
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
        
        if (restoredSession && restoredSession.pendingVision && restoredSession.onboardingStep !== 'complete') {
          // Only update step if not already set to avoid re-renders
          if (restoredSession.onboardingStep !== 'creation') {
            updateStep('creation');
          }
          setShouldOpenCreate(true);
          setHasProcessedOnboarding(true); // Mark as processed to prevent reopening
          
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
        }
      }
    };
    
    // Run check after a small delay to ensure page is loaded
    const timer = setTimeout(checkOnboarding, 100);
    return () => clearTimeout(timer);
  }, [searchParams, hasProcessedOnboarding, clearSession, isInitialized]);
  
  // Handle successful creation - clear session and close modal
  const handleCreateSuccess = useCallback(() => {
    console.log('[Fleet] Starship created successfully, clearing onboarding session');
    setShouldOpenCreate(false);
    setHasProcessedOnboarding(true);
    
    // Clear the session completely
    clearSession();
    localStorage.removeItem('onboarding_session');
    sessionStorage.removeItem('onboarding_session');
    
    // Clean up URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('onboarding');
    url.searchParams.delete('session');
    url.searchParams.delete('resumed');
    window.history.replaceState({}, '', url.pathname);
  }, [clearSession]);

  return (
    <AuthGate>
      <div className="h-screen w-screen overflow-hidden">
        <StarshipDashboard 
          autoOpenCreate={shouldOpenCreate} 
          onCreateSuccess={handleCreateSuccess}
        />
      </div>
    </AuthGate>
  );
}