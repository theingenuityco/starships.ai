import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { ExpeditionDetailsHeader } from '@/components/expedition/details/ExpeditionDetailsHeader';
import { ExpeditionChat } from '@/components/expedition/details/ExpeditionChat';
import { ExpeditionActivityLog } from '@/components/expedition/details/ExpeditionActivityLog';

interface PageProps {
  params: Promise<{
    slug: string;
    expeditionId: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, expeditionId } = await params;
  return {
    title: `Expedition Details | ${slug} | Starships AI`,
    description: `View expedition details for starship ${slug}`,
  };
}

export default async function ExpeditionDetailsPage({ params }: PageProps) {
  const { slug, expeditionId } = await params;
  
  return (
    <AuthGate>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <ExpeditionDetailsHeader 
              name="Expedition Alpha Mission"
              description="Exploring uncharted territories of the Andromeda sector with advanced AI agents"
            />
          </div>
          
          {/* Main content - Split view */}
          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-280px)]">
            {/* Chat Interface - Left side */}
            <div className="flex-1 lg:flex-[1.5] bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6 shadow-2xl">
              <ExpeditionChat expeditionId={expeditionId} />
            </div>
            
            {/* Activity Log - Right side */}
            <div className="lg:flex-1 bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6 shadow-2xl">
              <ExpeditionActivityLog />
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}