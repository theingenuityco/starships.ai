'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Terminal, Activity, Loader2,
  Shield, Navigation, MonitorSpeaker, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { starshipAPI, Starship } from '@/lib/api';

interface IndividualStarshipCommandDeckProps {
  slug: string;
  className?: string;
}

export function IndividualStarshipCommandDeck({ slug, className }: IndividualStarshipCommandDeckProps) {
  const [starship, setStarship] = useState<Starship | null>(null);
  const [starshipLoading, setStarshipLoading] = useState(true);

  // Fetch starship data
  useEffect(() => {
    const fetchStarship = async () => {
      try {
        setStarshipLoading(true);
        const data = await starshipAPI.getStarshipBySlug(slug);
        setStarship(data.starship);
      } catch (error) {
        console.error('Failed to fetch starship:', error);
      } finally {
        setStarshipLoading(false);
      }
    };

    fetchStarship();
  }, [slug]);

  return (
    <div className={cn("h-full flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/5", className)}>
      {/* Enhanced Professional Header - Matching Crew Console Style */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect - reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />
        
        <div className="relative flex items-center justify-between px-8 py-6 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all -ml-2 px-2"
              asChild
            >
              <Link href="/fleet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-primary/15 to-primary/10 p-3 rounded-xl shadow-sm border border-primary/15">
                    <Terminal className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Command Deck
                  </h1>
                  <p className="text-sm text-muted-foreground">Starship control and monitoring center</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Starship info */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/5" />
                <div className="relative bg-gradient-to-br from-green-500/15 to-green-500/10 p-2 rounded-lg">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-foreground">
                  {starshipLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    starship?.name || 'Unknown Starship'
                  )}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Active Starship
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 overflow-hidden bg-gradient-to-b from-background to-background/95 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <div className="relative">
            {/* Decorative background elements */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 rounded-3xl" />
            <div className="absolute top-10 left-10 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
            
            <Card className="relative overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl">
              <CardHeader className="pb-3 pt-3">
                <div className="text-center space-y-4">
                  <CardTitle className="text-2xl font-bold">
                    <span className="text-4xl mr-3">🚧</span> <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">Command Deck</span>
                  </CardTitle>
                  <p className="text-base text-muted-foreground max-w-2xl mx-auto">
                    This is the central command interface for managing your starship's internal operations and systems.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="relative">
                  {/* Animated illustration placeholder */}
                  <div className="relative h-44 mb-3 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
                    {/* Stars background */}
                    <div className="absolute inset-0 opacity-50">
                      <div className="absolute top-10 left-20 w-1 h-1 bg-white rounded-full animate-pulse" />
                      <div className="absolute top-20 right-30 w-1 h-1 bg-white rounded-full animate-pulse delay-100" />
                      <div className="absolute bottom-20 left-40 w-1 h-1 bg-white rounded-full animate-pulse delay-200" />
                      <div className="absolute top-40 right-20 w-1 h-1 bg-white rounded-full animate-pulse delay-300" />
                    </div>
                    
                    {/* Command center console illustration */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        {/* Console base */}
                        <div className="w-48 h-32 bg-gradient-to-b from-slate-700 to-slate-800 rounded-lg transform perspective-1000 rotateX-12">
                          {/* Screen */}
                          <div className="absolute top-2 left-2 right-2 h-20 bg-gradient-to-br from-blue-900 to-cyan-900 rounded">
                            <div className="p-2 space-y-1">
                              <div className="w-full h-1 bg-cyan-400/30 rounded animate-pulse" />
                              <div className="w-3/4 h-1 bg-cyan-400/20 rounded animate-pulse delay-100" />
                              <div className="w-5/6 h-1 bg-cyan-400/20 rounded animate-pulse delay-200" />
                            </div>
                          </div>
                          {/* Control panel */}
                          <div className="absolute bottom-2 left-2 right-2 h-8 bg-slate-600 rounded flex items-center justify-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-100" />
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse delay-200" />
                          </div>
                        </div>
                        
                        {/* Floating holographic displays */}
                        <div className="absolute -top-8 -left-12 w-16 h-12 bg-cyan-500/10 rounded transform rotate-12 animate-float">
                          <div className="p-1 space-y-0.5">
                            <div className="w-full h-0.5 bg-cyan-400/40" />
                            <div className="w-3/4 h-0.5 bg-cyan-400/30" />
                          </div>
                        </div>
                        <div className="absolute -top-8 -right-12 w-16 h-12 bg-blue-500/10 rounded transform -rotate-12 animate-float-delayed">
                          <div className="p-1 space-y-0.5">
                            <div className="w-full h-0.5 bg-blue-400/40" />
                            <div className="w-3/4 h-0.5 bg-blue-400/30" />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress indicator */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span>System under maintenance</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Feature list */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center w-9 h-9 bg-green-500/10 rounded-xl">
                        <MonitorSpeaker className="h-4 w-4 text-green-500" />
                      </div>
                      <h4 className="font-semibold text-sm">Life Support</h4>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center w-9 h-9 bg-blue-500/10 rounded-xl">
                        <Navigation className="h-4 w-4 text-blue-500" />
                      </div>
                      <h4 className="font-semibold text-sm">Navigation</h4>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center w-9 h-9 bg-purple-500/10 rounded-xl">
                        <Shield className="h-4 w-4 text-purple-500" />
                      </div>
                      <h4 className="font-semibold text-sm">Engineering</h4>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center w-9 h-9 bg-red-500/10 rounded-xl">
                        <Lock className="h-4 w-4 text-red-500" />
                      </div>
                      <h4 className="font-semibold text-sm">Security</h4>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-primary/10 via-blue-500/10 to-cyan-500/10 rounded-2xl p-3 text-center border border-primary/20">
                    <p className="text-lg font-semibold text-foreground">
                      Coming soon!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}