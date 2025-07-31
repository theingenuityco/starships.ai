import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { ExpeditionDashboard } from '@/components/expedition/ExpeditionDashboard';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Expeditions | Starships AI`,
    description: `Manage expeditions for starship ${slug}`,
  };
}

export default async function ExpeditionsPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <ExpeditionDashboard starshipSlug={slug} />
    </AuthGate>
  );
}