'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Search, Filter, Rocket, Clock, Users, Target } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreateExpeditionModal } from './CreateExpeditionModal';
import { ExpeditionCard } from './ExpeditionCard';
import { useExpeditionData } from '@/hooks/useExpeditionData';
// Socket import removed - using HTTP-only implementation
import { expeditionAPI } from '@/lib/expeditionApi';
import type { Expedition, ExpeditionStatus, ExpeditionPriority } from '@starships/protocol';

interface StarshipExpeditionsContentProps {
  slug: string;
}

export function StarshipExpeditionsContent({ slug }: StarshipExpeditionsContentProps) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpeditionStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ExpeditionPriority | 'all'>('all');

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
    const matchesSearch = expedition.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         expedition.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         expedition.objective.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || expedition.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || expedition.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
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
        <div className="p-6 border-b bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Rocket className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.totalExpeditions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{stats.activeExpeditions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">{stats.completedExpeditions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{Math.round(stats.successRate)}%</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="p-6 border-b">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expeditions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ExpeditionStatus | 'all')}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as ExpeditionPriority | 'all')}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Badge key={status} variant="secondary" className="text-xs">
              {status}: {count as number}
            </Badge>
          ))}
        </div>
      </div>

      {/* Expeditions List */}
      <div className="flex-1 p-6 overflow-auto">
        {expeditionsLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading expeditions...</p>
            </div>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredExpeditions.map((expedition, index) => (
              <motion.div
                key={expedition.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
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
                  onViewDetails={(expeditionId) => {
                    router.push(`/ship/${slug}/expeditions/${expeditionId}`);
                  }}
                  onViewChat={(expeditionId) => {
                    router.push(`/ship/${slug}/expeditions/${expeditionId}?tab=chat`);
                  }}
                  onViewAnalytics={(expeditionId) => {
                    router.push(`/ship/${slug}/expeditions/${expeditionId}?tab=analytics`);
                  }}
                  onEdit={(expeditionId) => {
                    // TODO: Implement edit functionality
                    console.log('Edit expedition:', expeditionId);
                  }}
                  onDuplicate={(expeditionId) => {
                    // TODO: Implement duplicate functionality
                    console.log('Duplicate expedition:', expeditionId);
                  }}
                  onDelete={async (expeditionId) => {
                    if (confirm('Are you sure you want to delete this expedition?')) {
                      try {
                        await expeditionAPI.deleteExpedition(starshipId, expeditionId);
                        refreshExpeditions();
                      } catch (error) {
                        console.error('Failed to delete expedition:', error);
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