'use client';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function CheckoutCancel() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-gray-600" />
          </div>
          <h1 className="text-xl font-semibold">Payment Cancelled</h1>
          <p className="text-muted-foreground">
            No charges were made. You can try again anytime.
          </p>
          <Button onClick={() => router.push('/')}>
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}