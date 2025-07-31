'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AuthGate } from '@/components/auth/AuthGate';
import { ExpeditionDetailsHeader } from '@/components/expedition/details/ExpeditionDetailsHeader';
import { ExpeditionChat } from '@/components/expedition/details/ExpeditionChat';
import { ExpeditionActivityLog } from '@/components/expedition/details/ExpeditionActivityLog';
import { expeditionAPI } from '@/lib/expedition-api';
import type { Expedition } from '@starships/protocol';

export default function ExpeditionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const expeditionId = params.expeditionId as string;
  
  const [expedition, setExpedition] = useState<Expedition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExpedition = async () => {
      try {
        const response = await expeditionAPI.get(expeditionId);
        setExpedition(response.expedition);
      } catch (err) {
        console.error('Failed to fetch expedition:', err);
        setError('Failed to load expedition details');
      } finally {
        setLoading(false);
      }
    };

    fetchExpedition();
  }, [expeditionId]);

  if (loading) {
    return (
      <AuthGate>
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black flex items-center justify-center">
          <div className="text-white">Loading expedition details...</div>
        </div>
      </AuthGate>
    );
  }

  if (error || !expedition) {
    return (
      <AuthGate>
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
          <div className="container mx-auto px-4 py-6 max-w-7xl">
            <div className="mb-6">
              <Link 
                href={`/ship/${slug}/expeditions`}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Expeditions
              </Link>
            </div>
            <div className="text-center py-12">
              <p className="text-red-400 text-lg">{error || 'Expedition not found'}</p>
            </div>
          </div>
        </div>
      </AuthGate>
    );
  }
  
  return (
    <AuthGate>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {/* Back button */}
          <div className="mb-6">
            <Link 
              href={`/ship/${slug}/expeditions`}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Expeditions
            </Link>
          </div>
          
          {/* Header */}
          <div className="mb-8">
            <ExpeditionDetailsHeader 
              name={expedition.name}
              description={expedition.description}
            />
          </div>
          
          {/* Main content - Split view */}
          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-280px)]">
            {/* Chat Interface - Left side */}
            <div className="flex-1 lg:flex-[1.5] bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6 shadow-2xl">
              <ExpeditionChat expeditionId={expeditionId} />
            </div>
            
            {/* Activity Log - Right side */}
            <div className="lg:flex-1 bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6 shadow-2xl">
              <ExpeditionActivityLog />
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}