'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { SubscriptionPlan } from '@/types/subscriptions';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isYearly: boolean;
  onSelectPlan: (plan: SubscriptionPlan) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isYearly,
  onSelectPlan,
}) => {
  const price = isYearly ? plan.priceYearly : plan.priceMonthly;
  const displayPrice = price / 100; // Convert from cents
  const period = isYearly ? 'year' : 'month';
  
  // Calculate monthly price for yearly plans
  const monthlyEquivalent = isYearly ? plan.priceYearly / 12 / 100 : null;
  
  const isFree = displayPrice === 0;
  
  return (
    <Card className={`relative p-6 bg-slate-800/50 border transition-all duration-200 hover:scale-105 ${
      plan.isPopular 
        ? 'border-purple-500 shadow-lg shadow-purple-500/25' 
        : 'border-slate-700 hover:border-purple-400'
    }`}>
      {plan.isPopular && (
        <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-600 hover:bg-purple-700">
          Most Popular
        </Badge>
      )}
      
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
        <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
        
        <div className="mb-4">
          {isFree ? (
            <div className="text-3xl font-bold text-white">Free</div>
          ) : (
            <div className="flex items-baseline justify-center">
              <span className="text-3xl font-bold text-white">${displayPrice.toFixed(0)}</span>
              <span className="text-gray-400 ml-1">/{period}</span>
            </div>
          )}
          
          {monthlyEquivalent && (
            <div className="text-sm text-gray-400 mt-1">
              ${monthlyEquivalent.toFixed(0)}/month when billed annually
            </div>
          )}
        </div>
      </div>
      
      <div className="space-y-3 mb-6">
        <FeatureItem 
          text={`${plan.features.agents} Agent${plan.features.agents !== 1 ? 's' : ''}`} 
        />
        <FeatureItem 
          text={plan.features.firstOfficer ? 'First Officer included' : 'No First Officer'} 
        />
        <FeatureItem 
          text={`${plan.features.mcps} MCP${plan.features.mcps !== 1 ? 's' : ''} at one time`} 
        />
        <FeatureItem 
          text={`${plan.features.expeditionsParallel} parallel expedition${plan.features.expeditionsParallel !== 1 ? 's' : ''}`} 
        />
        <FeatureItem 
          text={`${plan.features.artifactStorageGB}GB artifact storage`} 
        />
        <FeatureItem 
          text={`${(plan.features.tokenRateLimit / 1000).toFixed(0)}k tokens/minute`} 
        />
      </div>
      
      <Button
        className={`w-full ${
          plan.isPopular
            ? 'bg-purple-600 hover:bg-purple-700'
            : isFree
            ? 'bg-slate-600 hover:bg-slate-700'
            : 'bg-slate-700 hover:bg-slate-600'
        }`}
        onClick={() => onSelectPlan(plan)}
      >
        {isFree ? 'Current Plan' : 'Choose Plan'}
      </Button>
    </Card>
  );
};

const FeatureItem: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center space-x-3">
    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
    <span className="text-gray-300 text-sm">{text}</span>
  </div>
);