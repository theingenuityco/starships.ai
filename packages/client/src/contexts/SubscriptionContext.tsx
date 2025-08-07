'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs';
import { subscriptionAPI } from '@/lib/api';

export interface SubscriptionData {
  plan: 'scout' | 'cruiser';
  isActive: boolean;
  features: {
    agents: number;
    firstOfficer: boolean;
    mcps: number;
    expeditionsParallel: number;
    artifactStorageGB: number;
    tokenRateLimit: number;
  };
  subscription?: {
    currentPeriodEnd: string;
    stripeCustomerId: string;
    status: string;
  } | null;
}

interface SubscriptionContextType {
  subscription: SubscriptionData | null;
  loading: boolean;
  error: string | null;
  refetchSubscription: () => Promise<void>;
  
  // Helper functions for feature gating
  hasFeature: (feature: keyof SubscriptionData['features']) => boolean;
  canUseFeature: (feature: keyof SubscriptionData['features'], currentUsage?: number) => boolean;
  isPlanActive: (planName: 'scout' | 'cruiser') => boolean;
  isSubscribed: () => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useKindeBrowserClient();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await subscriptionAPI.getCurrentSubscription();
      setSubscription(data);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError('Failed to load subscription data');
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch subscription data when user is authenticated and auth loading is complete
    if (!authLoading && isAuthenticated) {
      fetchSubscription();
    } else if (!authLoading && !isAuthenticated) {
      // User is not authenticated, clear subscription data
      setSubscription(null);
      setLoading(false);
      setError(null);
    }
  }, [isAuthenticated, authLoading]);

  const refetchSubscription = async () => {
    await fetchSubscription();
  };

  // Helper functions for feature gating
  const hasFeature = (feature: keyof SubscriptionData['features']): boolean => {
    if (!subscription) return false;
    const featureValue = subscription.features[feature];
    return typeof featureValue === 'boolean' ? featureValue : featureValue > 0;
  };

  const canUseFeature = (feature: keyof SubscriptionData['features'], currentUsage: number = 0): boolean => {
    if (!subscription) return false;
    const limit = subscription.features[feature];
    if (typeof limit === 'boolean') return limit;
    return currentUsage < limit;
  };

  const isPlanActive = (planName: 'scout' | 'cruiser'): boolean => {
    if (!subscription) return false;
    return subscription.plan === planName && subscription.isActive === true;
  };

  const isSubscribed = (): boolean => {
    if (!subscription) return false;
    return subscription.isActive === true;
  };

  const contextValue: SubscriptionContextType = {
    subscription,
    loading,
    error,
    refetchSubscription,
    hasFeature,
    canUseFeature,
    isPlanActive,
    isSubscribed,
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

// Export individual hooks for specific use cases
export const useSubscriptionPlan = () => {
  const { subscription } = useSubscription();
  return subscription?.plan || 'scout';
};

export const useIsSubscribed = () => {
  const { isSubscribed } = useSubscription();
  return isSubscribed();
};

export const useFeatureLimit = (feature: keyof SubscriptionData['features']) => {
  const { subscription } = useSubscription();
  return subscription?.features[feature] || 0;
};

export const useCanUseFeature = (feature: keyof SubscriptionData['features'], currentUsage: number = 0) => {
  const { canUseFeature } = useSubscription();
  return canUseFeature(feature, currentUsage);
};