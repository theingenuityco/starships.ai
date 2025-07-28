'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Activity, Users, Zap, Shield, Navigation } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';
import type { Starship } from '@/lib/api';

interface IndividualStarshipCommandDeckProps {
  slug: string;
  className?: string;
}

export function IndividualStarshipCommandDeck({ slug, className }: IndividualStarshipCommandDeckProps) {
  const router = useRouter();
  const {
    starships,
    loading,
    error,
    loadUserStarships,
    getStarshipBySlug,
    setActiveStarshipBySlug,
    clearErrors
  } = useStarshipStore();

  const [starship, setStarship] = useState<Starship | null>(null);
  const [starshipLoading, setStarshipLoading] = useState(true);
  const [starshipError, setStarshipError] = useState<string | null>(null);

  // Load starship data
  useEffect(() => {
    const loadStarship = async () => {
      try {
        setStarshipLoading(true);
        setStarshipError(null);

        // Ensure starships are loaded
        if (starships.length === 0) {
          await loadUserStarships();
        }

        // Find starship by slug
        const foundStarship = await getStarshipBySlug(slug);
        
        if (foundStarship) {
          setStarship(foundStarship);
          // Set as active starship
          await setActiveStarshipBySlug(slug);
        } else {
          setStarshipError('Starship not found');
        }
      } catch (err) {
        setStarshipError(err instanceof Error ? err.message : 'Failed to load starship');
      } finally {
        setStarshipLoading(false);
      }
    };

    loadStarship();
  }, [slug, starships.length, loadUserStarships, getStarshipBySlug, setActiveStarshipBySlug]);

  const handleBackToFleet = () => {
    router.push('/fleet');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'docked':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'maintenance':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getClassIcon = (starshipClass: string) => {
    switch (starshipClass) {
      case 'scout':
        return <Navigation className="w-5 h-5" />;
      case 'cruiser':
        return <Shield className="w-5 h-5" />;
      default:
        return <Navigation className="w-5 h-5" />;
    }
  };

  if (starshipLoading || loading) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-8 h-8 border-2 border-t-transparent border-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading starship command deck...</p>
        </motion.div>
      </div>
    );
  }

  if (starshipError || error) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Starship not found</h3>
            <p className="text-muted-foreground">
              {starshipError || error || 'The requested starship could not be found.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleBackToFleet} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Fleet
            </Button>
            <Button 
              onClick={() => { 
                clearErrors(); 
                setStarshipError(null); 
                window.location.reload(); 
              }}
            >
              Try Again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!starship) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Starship not found</h3>
            <p className="text-muted-foreground">
              The starship with slug "{slug}" could not be found.
            </p>
          </div>
          <Button onClick={handleBackToFleet} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fleet
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("h-full p-6 space-y-6", className)}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToFleet}
            className="hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fleet
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {starship.name}
              </h1>
              <Badge className={cn("border", getStatusColor(starship.status))}>
                {starship.status}
              </Badge>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              {getClassIcon(starship.class)}
              <span className="capitalize">{starship.class} Class</span>
              <span>•</span>
              <span>ID: {starship.id}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </motion.div>

      {/* Internal Command Deck */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-1"
      >
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 h-full">
          <CardHeader>
            <CardTitle className="text-lg">Internal Command Deck</CardTitle>
            <p className="text-sm text-muted-foreground">
              You are now inside the {starship.name} command deck
            </p>
          </CardHeader>
          <CardContent className="h-full flex items-center justify-center">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
                <Settings className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold">Command Deck Systems</h3>
                <p className="text-muted-foreground max-w-lg">
                  Internal starship systems and controls will be available here.
                  This is the central command interface for managing your starship's
                  internal operations and systems.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-8 max-w-md mx-auto">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Life Support</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Navigation</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Engineering</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground">Security</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}