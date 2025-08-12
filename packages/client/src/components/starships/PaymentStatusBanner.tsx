'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle } from 'lucide-react';
import api from '@/lib/api';

interface PaymentStatusBannerProps {
  starship: {
    id: string;
    name: string;
    status: 'active' | 'restricted' | 'disabled';
    plan: 'scout' | 'cruiser' | 'draught';
  };
}

export function PaymentStatusBanner({ starship }: PaymentStatusBannerProps) {
  const handleManageSubscription = async () => {
    try {
      const response = await api.post(`/v1/${starship.id}/billing-portal`);
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error);
    }
  };

  if (starship.status === 'active' || starship.plan === 'scout') {
    return null;
  }

  if (starship.status === 'restricted') {
    return (
      <Card className="mb-4 border-orange-200 bg-orange-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span className="text-sm text-orange-800">
                Payment issue detected for {starship.name}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleManageSubscription}>
              Update Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (starship.status === 'disabled') {
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-800">
                Subscription ended for {starship.name}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleManageSubscription}>
              Reactivate
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}