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
    // Check if we're coming from onboarding
    const isOnboarding = searchParams.get('onboarding') === 'true';
    const isResumed = searchParams.get('resumed') === 'true';
    
    if (isOnboarding) {
      // Try to restore the session
      const restoredSession = restoreSession();
      
      if (restoredSession && restoredSession.pendingVision) {
        // Update step to creation
        updateStep('creation');
        setShouldOpenCreate(true);
        
        // Show a welcome back message if resumed
        if (isResumed) {
          toast.success('Welcome back! Let\'s continue creating your starship.', {
            description: `Vision: "${restoredSession.pendingVision.slice(0, 50)}..."`,
            duration: 5000,
          });
        }
      } else if (isOnboarding && !restoredSession) {
        // User came through onboarding flow but no session found
        // This could happen if session expired or was cleared
        toast.info('Let\'s create your first starship!');
        setShouldOpenCreate(true);
      }
    }
  }, [searchParams, restoreSession, updateStep]);
  
  return (
    <AuthGate>
      <div className="h-screen w-screen overflow-hidden">
        <StarshipDashboard autoOpenCreate={shouldOpenCreate} />
      </div>
    </AuthGate>
  );
}