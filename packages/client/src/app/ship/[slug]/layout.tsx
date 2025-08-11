'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SibilChatWidget } from '@/components/sibil/SibilChatWidget';
import { starshipAPI } from '@/lib/api';
import { useStarshipStore } from '@/store/starship-store';

interface LayoutProps {
  children: React.ReactNode;
}

export default function ShipLayout({ children }: LayoutProps) {
  const params = useParams();
  const slug = params?.slug as string;
  const { starships } = useStarshipStore();
  const [starshipId, setStarshipId] = useState<string | undefined>();
  const [isFirstStarship, setIsFirstStarship] = useState(false);
  
  useEffect(() => {
    const fetchStarshipData = async () => {
      if (!slug) return;
      
      try {
        const data = await starshipAPI.getStarshipBySlug(slug);
        setStarshipId(data.starship?.id);
        
        // Check if this is the user's first starship
        if (starships && starships.length === 1) {
          setIsFirstStarship(true);
        }
      } catch (error) {
        console.error('Failed to fetch starship for layout:', error);
      }
    };
    
    fetchStarshipData();
  }, [slug, starships]);
  
  return (
    <>
      {children}
      {starshipId && (
        <SibilChatWidget 
          starshipId={starshipId} 
          isFirstStarship={isFirstStarship}
        />
      )}
    </>
  );
}