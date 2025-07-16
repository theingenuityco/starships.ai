import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SimpleVisionChamber } from '@/components/vision-chamber/SimpleVisionChamber';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Vision Chamber | Starships AI`,
    description: `Vision chamber for starship ${slug}`,
  };
}

export default async function StarshipVisionChamberPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <div className="h-full flex flex-col">
        {/* Header with Back Navigation */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/ships">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Fleet
              </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              Starship: <span className="font-medium">{slug}</span>
            </div>
          </div>
        </div>

        {/* Main Content - Full Height Vision Chamber */}
        <div className="flex-1 overflow-hidden">
          <SimpleVisionChamber />
        </div>
      </div>
    </AuthGate>
  );
}