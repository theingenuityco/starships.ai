import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipCrewContent } from '@/components/crew/StarshipCrewContent';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Crew Management | Starships AI`,
    description: `Crew management for starship ${slug}`,
  };
}

export default async function StarshipCrewPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <StarshipCrewContent slug={slug} />
    </AuthGate>
  );
}