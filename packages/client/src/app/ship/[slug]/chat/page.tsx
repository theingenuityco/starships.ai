import { UnifiedChatInterface } from '@/components/chat/UnifiedChatInterface';

interface StarshipChatPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function StarshipChatPage({ params }: StarshipChatPageProps) {
  const { slug } = await params;
  
  return (
    <div className="h-full flex flex-col">
      <UnifiedChatInterface starshipId={slug} />
    </div>
  );
}