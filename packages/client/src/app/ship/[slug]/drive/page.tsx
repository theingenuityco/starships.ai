import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Zap } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Drive Systems | Starships AI`,
    description: `Drive systems for starship ${slug}`,
  };
}

export default async function StarshipDrivePage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <div className="h-full p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header with Back Navigation */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/fleet">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Fleet
                </Link>
              </Button>
              <div className="text-sm text-muted-foreground">
                Starship: <span className="font-medium">{slug}</span>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Drive Systems</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Zap className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Drive Systems Control</h3>
                <p className="text-muted-foreground mb-4">
                  Advanced propulsion and navigation systems for {slug}
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    🚀 Coming Soon: Complete drive system interface with propulsion control, 
                    navigation systems, and energy management.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGate>
  );
}