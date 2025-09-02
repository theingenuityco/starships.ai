'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SessionInterface } from '@/components/session/SessionInterface';
import { SessionsSidebar } from '@/components/session/SessionsSidebar';
import { starshipAPI, type Starship } from '@/lib/api';

export default function StarshipSessionPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [starship, setStarship] = useState<Starship | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStarshipData = async () => {
      if (!slug) return;
      
      try {
        setLoading(true);
        setError(null);
        const data = await starshipAPI.getStarshipBySlug(slug);
        setStarship(data.starship);
      } catch (error) {
        console.error('Failed to fetch starship for session:', error);
        setError('Failed to load starship data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStarshipData();
  }, [slug]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading starship...</p>
        </div>
      </div>
    );
  }

  if (error || !starship) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold text-foreground">Starship Not Found</h1>
          <p className="text-muted-foreground">
            {error || "The starship you're looking for could not be found or you don't have access to it."}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex">
      {/* Sessions Sidebar */}
      <div className="w-80 shrink-0">
        <SessionsSidebar
          starshipId={starship.id}
          onSessionSelect={(sessionId) => {
            // TODO: Handle session selection
            console.log('Selected session:', sessionId);
          }}
        />
      </div>
      
      {/* Main Session Interface */}
      <div className="flex-1 min-w-0">
        <SessionInterface starshipId={starship.id} />
      </div>
    </div>
  );
}