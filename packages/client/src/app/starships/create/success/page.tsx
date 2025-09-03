'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }

    // Simple delay then redirect - webhook handles starship creation
    const timer = setTimeout(() => {
      setStatus('success');
      setTimeout(() => router.push('/'), 3000);
    }, 2000);

    return () => clearTimeout(timer);
  }, [sessionId, router]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <h1 className="text-xl font-semibold">Processing Payment</h1>
            <p className="text-muted-foreground">Creating your starship...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center"
            >
              <CheckCircle className="w-8 h-8 text-green-600" />
            </motion.div>
            <h1 className="text-xl font-semibold">🚀 Starship Created!</h1>
            <p className="text-muted-foreground">
              Payment successful. Redirecting to your starship...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">
            Please check your starships or contact support.
          </p>
          <Button onClick={() => router.push('/')}>
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}