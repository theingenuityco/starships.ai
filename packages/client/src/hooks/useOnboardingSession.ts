import { useCallback } from 'react';

export interface OnboardingSession {
  currentStep?: string;
  starshipId?: string;
  createdAt?: string;
}

export function useOnboardingSession() {
  const restoreSession = useCallback((): OnboardingSession | null => {
    try {
      const stored = localStorage.getItem('onboarding-session');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to restore onboarding session:', error);
      return null;
    }
  }, []);

  const updateStep = useCallback((step: string, data?: Partial<OnboardingSession>) => {
    try {
      const session: OnboardingSession = {
        currentStep: step,
        createdAt: new Date().toISOString(),
        ...data
      };
      localStorage.setItem('onboarding-session', JSON.stringify(session));
    } catch (error) {
      console.error('Failed to update onboarding session:', error);
    }
  }, []);

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem('onboarding-session');
    } catch (error) {
      console.error('Failed to clear onboarding session:', error);
    }
  }, []);

  return {
    restoreSession,
    updateStep,
    clearSession
  };
}