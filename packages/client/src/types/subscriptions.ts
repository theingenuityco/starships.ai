export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: PlanFeatures;
  isPopular?: boolean;
}

export interface PlanFeatures {
  agents: number;
  firstOfficer: boolean;
  mcps: number;
  expeditionsParallel: number;
  artifactStorageGB: number;
  tokenRateLimit: number;
}

export interface PricingToggleState {
  isYearly: boolean;
}