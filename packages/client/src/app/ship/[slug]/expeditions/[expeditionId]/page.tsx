import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { ExpeditionDetails } from '@/components/expeditions/ExpeditionDetails';

interface PageProps {
  params: Promise<{
    slug: string;
    expeditionId: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, expeditionId } = await params;
  return {
    title: `Expedition ${expeditionId} | ${slug} | Starships AI`,
    description: `Expedition details and chat for starship ${slug}`,
  };
}

export default async function ExpeditionDetailPage({ params }: PageProps) {
  const { slug, expeditionId } = await params;
  
  return (
    <AuthGate>
      <ExpeditionDetails 
        starshipSlug={slug} 
        expeditionId={expeditionId} 
      />
    </AuthGate>
  );
}