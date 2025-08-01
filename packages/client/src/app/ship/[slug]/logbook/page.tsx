import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { LogbookContent } from '@/components/logbook/LogbookContent';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Logbook | Starships AI`,
    description: `Logbook for starship ${slug}`,
  };
}

export default async function StarshipLogbookPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <LogbookContent slug={slug} />
    </AuthGate>
  );
}