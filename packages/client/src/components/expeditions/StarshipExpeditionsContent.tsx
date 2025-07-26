'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Search, Filter, Rocket, Clock, Users, Target, TrendingUp, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreateExpeditionModal } from './CreateExpeditionModal';
import { ExpeditionCard } from './ExpeditionCard';
import { useExpeditionData } from '@/hooks/useExpeditionData';
// Socket import removed - using HTTP-only implementation
import { expeditionAPI } from '@/lib/expeditionApi';
import type { Expedition, ExpeditionStatus } from '@starships/protocol';

interface StarshipExpeditionsContentProps {
  slug: string;
}

export function StarshipExpeditionsContent({ slug }: StarshipExpeditionsContentProps) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpeditionStatus | 'all'>('all');

  // Get starship data (we'll need to fetch this)
  const [starshipId, setStarshipId] = useState<string>('');

  // Use expedition data hook
  const {
    expeditions,
    expeditionsLoading,
    expeditionsError,
    stats,
    refreshExpeditions
  } = useExpeditionData({
    starshipId,
    autoRefresh: true,
    refreshInterval: 30000
  });

  // HTTP-only implementation: Real-time updates disabled
  // Socket integration removed to use HTTP API only
  // Manual refresh is now the primary way to update expedition data

  // Fetch starship by slug to get the real ID
  useEffect(() => {
    const fetchStarshipBySlug = async () => {
      try {
        // Import the starship API
        const { default: api } = await import('@/lib/api');
        
        // Fetch starship by slug (the endpoint supports both ID and slug)
        const response = await api.get(`/api/starships/${slug}`);
        const starship = response.data.starship;
        
        if (starship?.id) {
          setStarshipId(starship.id);
        } else {
          console.warn(`[STARSHIP EXPEDITIONS] No starship found for slug: ${slug}`);
          // Set empty string to prevent API calls with invalid ID
          setStarshipId('');
        }
      } catch (error: any) {
        console.error(`[STARSHIP EXPEDITIONS] Failed to fetch starship by slug: ${slug}`, error);
        // If starship not found, set empty string to prevent API calls
        setStarshipId('');
      }
    };

    if (slug) {
      fetchStarshipBySlug();
    }
  }, [slug]);

  // Filter expeditions based on search and filters
  const filteredExpeditions = (expeditions || []).filter(expedition => {
    const matchesSearch = expedition.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         expedition.mission.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || expedition.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleExpeditionClick = (expeditionId: string) => {
    router.push(`/ship/${slug}/expeditions/${expeditionId}`);
  };

  const handleCreateExpedition = () => {
    setShowCreateModal(true);
  };

  const handleExpeditionCreated = () => {
    setShowCreateModal(false);
    refreshExpeditions();
  };

  // Get status counts for badges
  const statusCounts = (expeditions || []).reduce((acc, expedition) => {
    acc[expedition.status] = (acc[expedition.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-full flex flex-col">
      {/* Header with Back Navigation */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/ships">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Fleet
            </Link>
          </Button>
          <div className="text-sm text-muted-foreground">
            Starship: <span className="font-medium">{slug}</span>
          </div>
        </div>
        <Button onClick={handleCreateExpedition} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          New Expedition
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="p-6 border-b bg-gradient-to-br from-background to-muted/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="relative overflow-hidden border-primary/20 shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10" />
              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Missions</p>
                    <p className="text-3xl font-bold mt-1">{stats.totalExpeditions}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Rocket className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </div>
            </Card>
            <Card className="relative overflow-hidden border-blue-500/20 shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-500/10" />
              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Active Now</p>
                    <p className="text-3xl font-bold mt-1">{stats.activeExpeditions}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </div>
            </Card>
            <Card className="relative overflow-hidden border-green-500/20 shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-500/10" />
              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Completed</p>
                    <p className="text-3xl font-bold mt-1">{stats.completedExpeditions}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                </div>
              </div>
            </Card>
            <Card className="relative overflow-hidden border-purple-500/20 shadow-sm hover:shadow-md transition-shadow">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-500/10" />
              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Success Rate</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <p className="text-3xl font-bold">{Math.round(stats.successRate)}</p>
                      <span className="text-lg text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="p-6 border-b bg-muted/5">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, mission, or agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-background/60 backdrop-blur-sm border-muted-foreground/20 focus:border-primary/50 transition-colors"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ExpeditionStatus | 'all')}>
            <SelectTrigger className="w-full md:w-56 h-11 bg-background/60 backdrop-blur-sm border-muted-foreground/20">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter by status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  All Status
                </div>
              </SelectItem>
              <SelectItem value="draft">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-500" />
                  Draft
                </div>
              </SelectItem>
              <SelectItem value="planning">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  Planning
                </div>
              </SelectItem>
              <SelectItem value="in-progress">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  In Progress
                </div>
              </SelectItem>
              <SelectItem value="review">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  Review
                </div>
              </SelectItem>
              <SelectItem value="completed">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  Completed
                </div>
              </SelectItem>
              <SelectItem value="failed">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  Failed
                </div>
              </SelectItem>
              <SelectItem value="cancelled">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-500" />
                  Cancelled
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status badges */}
        {Object.keys(statusCounts).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(statusCounts).map(([status, count]) => {
              const statusConfig = {
                'draft': { 
                  className: 'text-slate-600 bg-slate-100/80 dark:bg-slate-900/50 dark:text-slate-400',
                  dotColor: 'bg-slate-400'
                },
                'planning': { 
                  className: 'text-blue-600 bg-blue-100/80 dark:bg-blue-900/50 dark:text-blue-400',
                  dotColor: 'bg-blue-500'
                },
                'in-progress': { 
                  className: 'text-amber-600 bg-amber-100/80 dark:bg-amber-900/50 dark:text-amber-400',
                  dotColor: 'bg-amber-500'
                },
                'review': { 
                  className: 'text-purple-600 bg-purple-100/80 dark:bg-purple-900/50 dark:text-purple-400',
                  dotColor: 'bg-purple-500'
                },
                'completed': { 
                  className: 'text-emerald-600 bg-emerald-100/80 dark:bg-emerald-900/50 dark:text-emerald-400',
                  dotColor: 'bg-emerald-500'
                },
                'failed': { 
                  className: 'text-red-600 bg-red-100/80 dark:bg-red-900/50 dark:text-red-400',
                  dotColor: 'bg-red-500'
                },
                'cancelled': { 
                  className: 'text-gray-600 bg-gray-100/80 dark:bg-gray-900/50 dark:text-gray-400',
                  dotColor: 'bg-gray-400'
                }
              }[status] || { 
                className: 'text-gray-600 bg-gray-100/80 dark:bg-gray-900/50 dark:text-gray-400',
                dotColor: 'bg-gray-400'
              };
              
              return (
                <div
                  key={status}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${statusConfig.className} transition-transform hover:scale-105`}
                >
                  <div className={`h-2 w-2 rounded-full ${statusConfig.dotColor}`} />
                  <span>{status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}</span>
                  <span className="font-semibold">{count as number}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expeditions List */}
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-b from-background to-muted/5">
        {expeditionsLoading || !starshipId ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[...Array(6)].map((_, index) => (
              <Card key={index} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6 mt-1" />
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-7 w-7 rounded-full" />
                      ))}
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-8 w-full rounded-lg" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : expeditionsError ? (
          <div className="flex items-center justify-center h-64">
            <Card className="p-6 text-center">
              <p className="text-red-500 mb-4">Error loading expeditions</p>
              <p className="text-sm text-muted-foreground mb-4">{expeditionsError?.message || 'Unknown error occurred'}</p>
              <Button onClick={refreshExpeditions} variant="outline">
                Try Again
              </Button>
            </Card>
          </div>
        ) : filteredExpeditions.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Card className="p-8 text-center max-w-md">
              <Rocket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Expeditions Found</h3>
              <p className="text-muted-foreground mb-4">
                {(expeditions || []).length === 0
                  ? "Start your first expedition to explore new possibilities."
                  : "No expeditions match your current filters."
                }
              </p>
              {(expeditions || []).length === 0 && (
                <Button onClick={handleCreateExpedition}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Expedition
                </Button>
              )}
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredExpeditions.map((expedition, index) => (
              <motion.div
                key={expedition.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05, type: "spring", stiffness: 100 }}
              >
                <ExpeditionCard
                  expedition={expedition}
                  onClick={() => handleExpeditionClick(expedition.id)}
                  showActions={true}
                  enableRealTimeUpdates={false}
                  enableContextMenu={true}
                  showAgentAvatars={true}
                  showQualityScore={true}
                  showTaskProgress={true}
                  onStart={async (expeditionId) => {
                    try {
                      await expeditionAPI.startExpedition(starshipId, expeditionId);
                      refreshExpeditions();
                      return true;
                    } catch (error) {
                      console.error('Failed to start expedition:', error);
                      return false;
                    }
                  }}
                  onPause={async (expeditionId) => {
                    try {
                      await expeditionAPI.pauseExpedition(starshipId, expeditionId);
                      refreshExpeditions();
                      return true;
                    } catch (error) {
                      console.error('Failed to pause expedition:', error);
                      return false;
                    }
                  }}
                  onResume={async (expeditionId) => {
                    try {
                      await expeditionAPI.resumeExpedition(starshipId, expeditionId);
                      refreshExpeditions();
                      return true;
                    } catch (error) {
                      console.error('Failed to resume expedition:', error);
                      return false;
                    }
                  }}
                  onCancel={async (expeditionId) => {
                    try {
                      await expeditionAPI.cancelExpedition(starshipId, expeditionId);
                      refreshExpeditions();
                      return true;
                    } catch (error) {
                      console.error('Failed to cancel expedition:', error);
                      return false;
                    }
                  }}
                  onViewChat={(expeditionId) => {
                    router.push(`/ship/${slug}/expeditions/${expeditionId}?tab=chat`);
                  }}
                  onDelete={async (expeditionId) => {
                    if (confirm('Are you sure you want to delete this expedition? This action cannot be undone.')) {
                      try {
                        await expeditionAPI.deleteExpedition(starshipId, expeditionId);
                        refreshExpeditions();
                      } catch (error: any) {
                        console.error('Failed to delete expedition:', error);
                        // Show a user-friendly error message
                        const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete expedition';
                        alert(`Error: ${errorMessage}`);
                      }
                    }
                  }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Expedition Modal */}
      <CreateExpeditionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onExpeditionCreated={handleExpeditionCreated}
        starshipId={starshipId}
        starshipSlug={slug}
      />
    </div>
  );
}