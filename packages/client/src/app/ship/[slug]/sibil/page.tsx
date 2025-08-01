import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { SibilContent } from '@/components/sibil/SibilContent';

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
      <SibilContent slug={slug} />
    </AuthGate>
  );
}