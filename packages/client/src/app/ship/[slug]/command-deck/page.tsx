import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { IndividualStarshipCommandDeck } from '@/components/command-deck/starship/IndividualStarshipCommandDeck';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} Command Deck | Starships AI`,
    description: `Command deck for starship ${slug}`,
  };
}

export default async function IndividualStarshipCommandDeckPage({ params }: PageProps) {
  const { slug } = await params;
  
  return (
    <AuthGate>
      <div className="h-full">
        <IndividualStarshipCommandDeck slug={slug} />
      </div>
    </AuthGate>
  );
}