'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PricingToggle } from './PricingToggle';
import { PlanCard } from './PlanCard';
import { subscriptionAPI } from '@/lib/api';
import { SubscriptionPlan } from '@/types/subscriptions';

export const PricingPage: React.FC = () => {
  const router = useRouter();
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const fetchedPlans = await subscriptionAPI.getPlans();
        setPlans(fetchedPlans);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch subscription plans:', err);
        setError('Failed to load subscription plans. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    // For now, just show an alert since payment processing is not yet implemented
    if (plan.priceMonthly === 0) {
      alert('You are already on the Scout (Free) plan!');
    } else {
      alert(`Payment processing for ${plan.name} will be implemented in a future update.`);
    }
  };

  const handleBackToFleet = () => {
    router.push('/fleet');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="text-red-400 text-center">
            <p className="text-lg font-semibold mb-2">Error Loading Plans</p>
            <p className="text-sm">{error}</p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Button
          variant="ghost"
          onClick={handleBackToFleet}
          className="text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Fleet
        </Button>
      </div>

      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <Rocket className="w-8 h-8 text-purple-500 mr-3" />
          <h1 className="text-4xl font-bold text-white">Choose Your Mission</h1>
        </div>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Select the perfect plan for your space exploration needs. Upgrade or downgrade anytime.
        </p>
      </div>

      {/* Pricing Toggle */}
      <PricingToggle isYearly={isYearly} onChange={setIsYearly} />

      {/* Plans Grid */}
      {plans.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isYearly={isYearly}
              onSelectPlan={handleSelectPlan}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-400">No subscription plans available at the moment.</p>
        </div>
      )}

      {/* FAQ Section */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-8">
          Frequently Asked Questions
        </h2>
        
        <div className="space-y-6">
          <FAQItem
            question="Can I change my plan anytime?"
            answer="Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately and you'll be prorated accordingly."
          />
          <FAQItem
            question="What happens to my data if I downgrade?"
            answer="Your data is preserved when you downgrade. However, you may need to reduce usage to fit within your new plan's limits."
          />
          <FAQItem
            question="Do you offer refunds?"
            answer="We offer a 30-day money-back guarantee for all paid plans. Contact support if you're not satisfied."
          />
        </div>
      </div>
    </div>
  );
};

const FAQItem: React.FC<{ question: string; answer: string }> = ({
  question,
  answer,
}) => (
  <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/30">
    <h3 className="text-white font-semibold mb-2">{question}</h3>
    <p className="text-gray-400 text-sm">{answer}</p>
  </div>
);