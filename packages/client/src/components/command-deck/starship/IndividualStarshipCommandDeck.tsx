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
    <div className={cn("h-full bg-gradient-to-br from-background via-background to-primary/5", className)}>
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 h-full flex flex-col p-6 space-y-6">
        {/* Enhanced Header */}
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
              className="hover:bg-primary/10 hover:text-primary transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Fleet
            </Button>
            <div className="h-8 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
            <div className="space-y-1">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-sm" />
                  <div className="relative p-2 bg-gradient-to-br from-primary/30 to-primary/20 rounded-lg">
                    {getClassIcon(starship.class)}
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {starship.name}
                  </h1>
                  <div className="flex items-center space-x-2 text-sm">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs border-current",
                        starship.status === 'active' 
                          ? 'text-green-500 bg-green-500/10' 
                          : 'text-amber-500 bg-amber-500/10'
                      )}
                    >
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full mr-1.5",
                        starship.status === 'active' ? 'bg-green-500' : 'bg-amber-500',
                        starship.status === 'active' && 'animate-pulse'
                      )} />
                      {starship.status}
                    </Badge>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground capitalize">{starship.class} Class</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" className="border-border/50 hover:border-primary/50">
              <Activity className="w-4 h-4 mr-2" />
              Diagnostics
            </Button>
            <Button variant="outline" size="sm" className="border-border/50 hover:border-primary/50">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </motion.div>

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