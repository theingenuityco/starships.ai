'use client';

import { AuthGate } from '@/components/auth/AuthGate';
import { PricingPage } from '@/components/subscriptions/PricingPage';

export default function SubscriptionPricingPage() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <PricingPage />
      </div>
    </AuthGate>
  );
}