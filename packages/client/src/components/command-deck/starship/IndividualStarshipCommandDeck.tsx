'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Settings, Activity, Users, Zap, Shield, Navigation,
  Cpu, Terminal, Database, Gauge, AlertCircle, CheckCircle2,
  Radar, Lock, BarChart3, Globe, Layers, Power, Rocket,
  MonitorSpeaker, Battery, Wifi, Cloud, Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

  // Mock system data for demonstration with some randomization for realism
  // Must be declared before any conditional returns to follow Rules of Hooks
  const systemData = useMemo(() => ({
    power: { 
      current: 85 + Math.floor(Math.random() * 5), 
      max: 100, 
      trend: 'stable' 
    },
    shields: { 
      current: 92 + Math.floor(Math.random() * 3), 
      max: 100, 
      status: 'optimal' 
    },
    engines: { 
      current: 78 + Math.floor(Math.random() * 4), 
      max: 100, 
      efficiency: 94 
    },
    lifeSupport: { 
      oxygen: 98, 
      temperature: 21 + (Math.random() * 0.5 - 0.25), 
      pressure: 101.3 + (Math.random() * 0.2 - 0.1) 
    },
    navigation: { 
      destination: 'Sector 7G', 
      eta: '3.2 hours', 
      speed: 'Warp 2' 
    },
    communications: { 
      status: 'online', 
      signal: 98 - Math.floor(Math.random() * 3), 
      channels: 12 
    }
  }), []);

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
              onClick={handleBackToFleet}
            >
              <ArrowLeft className="h-4 w-4" />
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

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              {/* Stats Cards */}
              <div className="flex items-center gap-3">
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Power className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Power</p>
                        <p className="text-sm font-bold">{systemData.power.current}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Shields</p>
                        <p className="text-sm font-bold">{systemData.shields.current}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                  {starship.name}
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

      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex-1 p-6 overflow-auto">{/* removed space-y-6 from original */}

        {/* Main Command Deck Interface */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-auto">
          {/* Primary Systems Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-8 space-y-6"
          >
            {/* Core Systems Status */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    Core Systems
                  </CardTitle>
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="mr-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </motion.div>
                    All Systems Operational
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Power Systems */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Power className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium">Main Power</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {systemData.power.current}% / {systemData.power.max}%
                    </span>
                  </div>
                  <div className="relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                    >
                      <Progress 
                        value={systemData.power.current} 
                        className="h-2 bg-muted/30"
                      />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-amber-500/0 rounded-full" />
                  </div>
                </div>

                {/* Shield Systems */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">Shield Integrity</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {systemData.shields.current}% / {systemData.shields.max}%
                    </span>
                  </div>
                  <div className="relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                    >
                      <Progress 
                        value={systemData.shields.current} 
                        className="h-2 bg-muted/30"
                      />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-blue-500/0 rounded-full" />
                  </div>
                </div>

                {/* Engine Systems */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Engine Output</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {systemData.engines.current}% / {systemData.engines.max}%
                    </span>
                  </div>
                  <div className="relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      <Progress 
                        value={systemData.engines.current} 
                        className="h-2 bg-muted/30"
                      />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-green-500/0 rounded-full" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Navigation & Operations */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden group hover:border-primary/30 transition-all">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-primary" />
                    Navigation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Destination</span>
                      <span className="text-sm font-medium">{systemData.navigation.destination}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">ETA</span>
                      <span className="text-sm font-medium">{systemData.navigation.eta}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Speed</span>
                      <Badge variant="secondary" className="text-xs">
                        {systemData.navigation.speed}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden group hover:border-primary/30 transition-all">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MonitorSpeaker className="w-4 h-4 text-primary" />
                    Life Support
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Oxygen</span>
                      <span className="text-sm font-medium">{systemData.lifeSupport.oxygen}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Temperature</span>
                      <span className="text-sm font-medium">{systemData.lifeSupport.temperature.toFixed(1)}°C</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Pressure</span>
                      <span className="text-sm font-medium">{systemData.lifeSupport.pressure.toFixed(1)} kPa</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>

          {/* Secondary Systems & Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-4 space-y-6"
          >
            {/* Communications */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-primary" />
                  Communications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline" className="text-xs text-green-500 bg-green-500/10">
                      {systemData.communications.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Signal Strength</span>
                      <span className="font-medium">{systemData.communications.signal}%</span>
                    </div>
                    <Progress value={systemData.communications.signal} className="h-1.5" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Channels</span>
                    <span className="text-sm font-medium">{systemData.communications.channels} active</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/50 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => router.push(`/ship/${slug}/crew`)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Manage Crew
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/50 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => router.push(`/ship/${slug}/expeditions`)}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  View Expeditions
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/50 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => router.push(`/ship/${slug}/logbook`)}
                >
                  <Database className="w-4 h-4 mr-2" />
                  Access Logbook
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/50 hover:border-primary/50 hover:bg-primary/5"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  System Analytics
                </Button>
              </CardContent>
            </Card>

            {/* Security Status */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm">All Systems Secure</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    View Logs
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}