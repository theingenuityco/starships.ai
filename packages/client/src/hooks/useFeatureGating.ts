import { useSubscription } from '@/contexts/SubscriptionContext';

/**
 * Custom hook for feature gating based on subscription plan
 * Usage examples:
 * 
 * const { canCreateAgent, canUseFirstOfficer, agentLimit } = useFeatureGating();
 * 
 * if (canCreateAgent(currentAgentCount)) {
 *   // Allow creating new agent
 * }
 * 
 * if (!canUseFirstOfficer) {
 *   // Show upgrade prompt
 * }
 */
export const useFeatureGating = () => {
  const { subscription, canUseFeature, hasFeature, isPlanActive, isSubscribed } = useSubscription();

  return {
    // Subscription status
    isSubscribed: isSubscribed(),
    currentPlan: subscription?.plan || null,
    isScoutPlan: isPlanActive('scout'),
    isCruiserPlan: isPlanActive('cruiser'),
    
    // Feature limits (null if no subscription data)
    agentLimit: subscription?.features.agents || null,
    mcpLimit: subscription?.features.mcps || null,
    expeditionParallelLimit: subscription?.features.expeditionsParallel || null,
    artifactStorageLimit: subscription?.features.artifactStorageGB || null,
    tokenRateLimit: subscription?.features.tokenRateLimit || null,
    
    // Feature checks
    canUseFirstOfficer: hasFeature('firstOfficer'),
    
    // Usage checks (pass current usage to check if more can be used)
    canCreateAgent: (currentCount: number = 0) => canUseFeature('agents', currentCount),
    canAddMCP: (currentCount: number = 0) => canUseFeature('mcps', currentCount),
    canStartExpedition: (currentCount: number = 0) => canUseFeature('expeditionsParallel', currentCount),
    canUploadArtifact: (currentUsageGB: number = 0) => canUseFeature('artifactStorageGB', currentUsageGB),
    
    // Helper functions (return null if no subscription data)
    getRemainingAgents: (currentCount: number = 0) => 
      subscription?.features.agents ? Math.max(0, subscription.features.agents - currentCount) : null,
    getRemainingMCPs: (currentCount: number = 0) => 
      subscription?.features.mcps ? Math.max(0, subscription.features.mcps - currentCount) : null,
    getRemainingExpeditions: (currentCount: number = 0) => 
      subscription?.features.expeditionsParallel ? Math.max(0, subscription.features.expeditionsParallel - currentCount) : null,
    getRemainingStorage: (currentUsageGB: number = 0) => 
      subscription?.features.artifactStorageGB ? Math.max(0, subscription.features.artifactStorageGB - currentUsageGB) : null,
    
    // Full subscription data for custom logic
    subscription,
  };
};