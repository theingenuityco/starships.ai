import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SibilChatInterface } from '@/components/sibil/SibilChatInterface'

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Sibil AI | Starships AI`,
    description: `Sibil AI interface for starship ${slug}`,
  };
}

export default async function StarshipSibilPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <div className="h-full flex flex-col">
        {/* Header with Back Navigation */}
        <div className="flex items-center justify-between p-6 border-b">
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

        {/* Main Content - Full Height Sibil Interface */}
        <div className="flex-1 overflow-hidden">
          <SibilChatInterface />
        </div>
      </div>
    </AuthGate>
  );
}