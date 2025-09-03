import { Metadata } from 'next';
import { JwtAuthGate } from '@/components/auth/JwtAuthGate';
import { StarshipCrewContent } from '@/components/crew/StarshipCrewContent';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Crew Console | Starships AI`,
    description: `Crew management for starship ${slug}`,
  };
}

export default async function StarshipCrewPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <JwtAuthGate>
      <StarshipCrewContent slug={slug} />
    </JwtAuthGate>
  );
}