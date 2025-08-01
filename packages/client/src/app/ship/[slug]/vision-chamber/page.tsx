import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { VisionChamberContent } from '@/components/vision-chamber/VisionChamberContent';

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
      <VisionChamberContent slug={slug} />
    </AuthGate>
  );
}