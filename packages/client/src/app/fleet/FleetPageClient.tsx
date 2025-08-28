'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { toast } from 'sonner';

interface FleetPageClientProps {
  user: any;
  isAuthenticated: boolean;
}

export default function FleetPageClient({ user, isAuthenticated }: FleetPageClientProps) {
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
      
      console.log('[Fleet] Onboarding check:', { 
        isOnboarding, 
        isResumed,
        fromSearchParams: { isOnboardingFromSearchParams, isResumedFromSearchParams },
        fromWindow: { isOnboardingFromWindow, isResumedFromWindow }
      });
      
      if (isOnboarding || isResumed) {
        const session = restoreSession();
        
        if (!session) {
          console.log('[Fleet] No saved onboarding session found');
          if (isResumed) {
            toast.error('Your onboarding session has expired. Please start over.');
          }
        } else {
          console.log('[Fleet] Restored onboarding session:', session);
          
          // Update current step to 'agent-details' since they're logged in
          updateStep('agent-details');
          
          // Open create dialog after a delay
          setTimeout(() => {
            setShouldOpenCreate(true);
            console.log('[Fleet] Opening create dialog for onboarding');
            
            // Clear onboarding URL params after opening dialog
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('onboarding');
            newUrl.searchParams.delete('resumed');
            window.history.replaceState({}, '', newUrl.toString());
          }, 500);
        }
      }
      
      // Mark as processed
      setHasProcessedOnboarding(true);
    };
    
    // Use timeout to ensure auth state is settled
    const timeout = setTimeout(checkOnboarding, 100);
    
    return () => clearTimeout(timeout);
  }, [searchParams, hasProcessedOnboarding, isInitialized]);
  
  const handleCreateDialogClose = (wasOnboarding: boolean) => {
    setShouldOpenCreate(false);
    if (wasOnboarding) {
      // Clear session after successful completion
      clearSession();
      console.log('[Fleet] Onboarding completed, session cleared');
    }
  };
  
  // Always render the dashboard since we know user is authenticated (checked server-side)
  return (
    <StarshipDashboard 
      shouldOpenCreateDialog={shouldOpenCreate}
      onCreateDialogClose={handleCreateDialogClose}
    />
  );
}