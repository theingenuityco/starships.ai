'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PricingToggle } from './PricingToggle';
import { PlanCard } from './PlanCard';
import { subscriptionAPI } from '@/lib/api';
import { SubscriptionPlan } from '@/types/subscriptions';
import { useSubscription } from '@/contexts/SubscriptionContext';

export const PricingPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subscription: currentSubscription, refetchSubscription } = useSubscription();
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<{
    type: 'success' | 'failed' | 'expired' | 'cancelled' | null;
    message: string;
  }>({ type: null, message: '' });

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const fetchedPlans = await subscriptionAPI.getPlans();
        setPlans(fetchedPlans);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch plans:', err);
        setError('Failed to load subscription plans. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  useEffect(() => {
    const verifyPaymentStatus = async () => {
      const sessionId = searchParams?.get('session_id');
      const success = searchParams?.get('success');
      const canceled = searchParams?.get('canceled');

      // Handle cancellation
      if (canceled === 'true') {
        setPaymentStatus({
          type: 'cancelled',
          message: 'Payment was cancelled. You can try again anytime.'
        });
        return;
      }

      // Handle success with session verification
      if (success === 'true' && sessionId) {
        try {
          const sessionStatus = await subscriptionAPI.verifySession(sessionId);
          
          if (sessionStatus.status === 'complete' && sessionStatus.payment_status === 'paid') {
            setPaymentStatus({
              type: 'success',
              message: '🎉 Payment successful! Your subscription has been activated.'
            });
            // Refetch subscription data after successful payment
            await refetchSubscription();
          } else if (sessionStatus.status === 'expired') {
            setPaymentStatus({
              type: 'expired',
              message: 'Payment session expired. Please try again.'
            });
          } else {
            setPaymentStatus({
              type: 'failed',
              message: 'Payment was not completed. Please try again.'
            });
          }
        } catch (error) {
          console.error('Failed to verify payment session:', error);
          setPaymentStatus({
            type: 'failed',
            message: 'Unable to verify payment status. Please contact support if charged.'
          });
        }
      }

      // Clean up URL parameters
      if (sessionId || success || canceled) {
        window.history.replaceState({}, '', '/fleet/pricing');
      }
    };

    verifyPaymentStatus();
  }, [searchParams]);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    try {
      if (plan.priceMonthly === 0) {
        alert('You are already on the Scout (Free) plan!');
        return;
      }

      // Get the correct price ID based on billing toggle
      const priceId = isYearly ? plan.yearlyPriceId : plan.monthlyPriceId;
      
      console.log(`Creating checkout for plan: ${plan.name}, priceId: ${priceId}`);
      
      // Call API to create checkout session  
      const { url } = await subscriptionAPI.createCheckout(priceId);
      
      // Redirect to Stripe Checkout
      window.location.href = url;
      
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start checkout. Please try again.');
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

      {/* Payment Status Messages */}
      {paymentStatus.type && (
        <div className={`p-4 rounded-lg mb-6 text-center ${
          paymentStatus.type === 'success' ? 'bg-green-600 text-white' :
          paymentStatus.type === 'failed' || paymentStatus.type === 'expired' ? 'bg-red-600 text-white' :
          'bg-yellow-600 text-white'
        }`}>
          {paymentStatus.message}
          {(paymentStatus.type === 'failed' || paymentStatus.type === 'expired') && (
            <div className="mt-2">
              <button 
                onClick={() => setPaymentStatus({ type: null, message: '' })}
                className="underline hover:no-underline"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Current Subscription Status */}
      {currentSubscription?.isActive && (
        <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-4 mb-6 text-center">
          <div className="text-blue-300 text-sm mb-1">Current Plan</div>
          <div className="text-white text-xl font-semibold capitalize mb-2">
            {currentSubscription.plan} Plan
          </div>
          {currentSubscription.subscription && (
            <div className="text-blue-200 text-sm">
              Active until {new Date(currentSubscription.subscription.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {/* Pricing Toggle */}
      <PricingToggle isYearly={isYearly} onChange={setIsYearly} />

      {/* Plans Grid */}
      {plans.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {plans.map((plan) => {
            const isCurrentPlan = currentSubscription?.isActive && 
              currentSubscription.plan === plan.name.toLowerCase();
            const isSubscribed = currentSubscription?.isActive || false;
            
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                isYearly={isYearly}
                onSelectPlan={handleSelectPlan}
                isCurrentPlan={isCurrentPlan}
                isSubscribed={isSubscribed}
              />
            );
          })}
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