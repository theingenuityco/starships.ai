'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Search, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { expeditionAPI } from '@/lib/expedition-api';
import { starshipAPI } from '@/lib/api';
import { ExpeditionCard } from './ExpeditionCard';
import { ExpeditionCreateModal } from './ExpeditionCreateModal';
import { ExpeditionStats } from './ExpeditionStats';
import type { Expedition, Agent } from '@starships/protocol';
import type { Starship } from '@/lib/api';

interface ExpeditionDashboardProps {
  starshipSlug: string;
}

export function ExpeditionDashboard({ starshipSlug }: ExpeditionDashboardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [starship, setStarship] = useState<Starship | null>(null);
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [expeditionAgents, setExpeditionAgents] = useState<Record<string, Agent[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [starshipSlug]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Get starship by slug
      const starshipResponse = await starshipAPI.getStarshipBySlug(starshipSlug);
      setStarship(starshipResponse.starship);
      
      // Load expeditions
      const expeditionData = await expeditionAPI.list(starshipResponse.starship.id);
      setExpeditions(expeditionData.expeditions);
      
      // Load agents for each expedition
      const agentsMap: Record<string, Agent[]> = {};
      for (const expedition of expeditionData.expeditions) {
        const details = await expeditionAPI.get(expedition.id);
        agentsMap[expedition.id] = details.agents;
      }
      setExpeditionAgents(agentsMap);
    } catch (error: any) {
      console.error('Failed to load expeditions:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to load expeditions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (expeditionId: string) => {
    try {
      await expeditionAPI.delete(expeditionId);
      toast({
        title: 'Expedition deleted',
        description: 'The expedition has been deleted successfully'
      });
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete expedition:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete expedition',
        variant: 'destructive'
      });
    }
  };

  const handleCreateSuccess = () => {
    loadData();
  };

  // Filter expeditions based on search
  const filteredExpeditions = expeditions.filter(expedition =>
    expedition.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expedition.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats
  const totalAgents = Object.values(expeditionAgents).reduce(
    (sum, agents) => sum + agents.length,
    0
  );
  const activeExpeditions = expeditions.filter(e => e.status === 'active').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!starship) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Starship not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expeditions</h1>
          <p className="text-muted-foreground mt-1">
            Manage expeditions for {starship.name}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Expedition
        </Button>
      </div>

      {/* Stats */}
      <ExpeditionStats
        totalExpeditions={expeditions.length}
        totalAgents={totalAgents}
        activeExpeditions={activeExpeditions}
      />

      {/* Search */}
      {expeditions.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search expeditions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Expeditions Grid */}
      {filteredExpeditions.length === 0 ? (
        <div className="text-center py-12 bg-muted/5 border border-dashed border-muted rounded-lg">
          <Rocket className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No expeditions yet</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery
              ? 'No expeditions match your search'
              : 'Create your first expedition to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Expedition
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExpeditions.map(expedition => (
            <ExpeditionCard
              key={expedition.id}
              expedition={expedition}
              agents={expeditionAgents[expedition.id] || []}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <ExpeditionCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        starshipId={starship.id}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}