import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipExpeditionsContent } from '@/components/expeditions/StarshipExpeditionsContent';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Expeditions | Starships AI`,
    description: `Expeditions for starship ${slug}`,
  };
}

export default async function StarshipExpeditionsPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <StarshipExpeditionsContent slug={slug} />
    </AuthGate>
  );
}