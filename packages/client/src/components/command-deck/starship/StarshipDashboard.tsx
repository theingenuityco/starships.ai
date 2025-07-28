'use client';

import React, { useState, useEffect } from 'react';
import { Search, Rocket, AlertCircle, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useStarshipStore } from '@/store/starship-store';
import { StarshipCard } from './StarshipCard';
import { StarshipCreateModal } from './StarshipCreateModal';
import { StarshipEditModal } from './StarshipEditModal';
import { StarshipDeleteDialog } from './StarshipDeleteDialog';
import { StarshipStatusManager } from './StarshipStatusManager';
import { cn } from '@/lib/utils';

interface StarshipDashboardProps {
  className?: string;
}

export function StarshipDashboard({ className }: StarshipDashboardProps) {
  const {
    starships,
    activeStarshipId,
    loading,
    loadingStarships,
    error,
    loadUserStarships,
    setActiveStarship,
    clearErrors
  } = useStarshipStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive' | 'scout' | 'cruiser'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStarship, setEditingStarship] = useState<string | null>(null);
  const [deletingStarship, setDeletingStarship] = useState<string | null>(null);
  const [statusManagingStarship, setStatusManagingStarship] = useState<string | null>(null);

  // Load starships on mount
  useEffect(() => {
    loadUserStarships();
  }, [loadUserStarships]);

  // Filter starships based on search query and active filter
  const filteredStarships = starships.filter(starship => {
    // Search filter
    const matchesSearch = starship.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      starship.class.toLowerCase().includes(searchQuery.toLowerCase()) ||
      starship.status.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Status/type filter
    const matchesFilter = 
      activeFilter === 'all' ||
      (activeFilter === 'active' && starship.status === 'active') ||
      (activeFilter === 'inactive' && starship.status === 'inactive') ||
      (activeFilter === 'scout' && starship.class === 'scout') ||
      (activeFilter === 'cruiser' && starship.class === 'cruiser');
    
    return matchesSearch && matchesFilter;
  });

  const handleStarshipSelect = (starshipId: string) => {
    setActiveStarship(starshipId);
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
  };

  const handleEditSuccess = () => {
    setEditingStarship(null);
  };

  const handleDeleteSuccess = () => {
    setDeletingStarship(null);
  };

  const handleStatusUpdateSuccess = () => {
    setStatusManagingStarship(null);
  };

  // Fleet overview stats
  const fleetStats = {
    total: starships.length,
    active: starships.filter(s => s.status === 'active').length,
    inactive: starships.filter(s => s.status === 'inactive').length,
    scouts: starships.filter(s => s.class === 'scout').length,
    cruisers: starships.filter(s => s.class === 'cruiser').length
  };

  if (loadingStarships && starships.length === 0) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-8 h-8 border-2 border-t-transparent border-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading your fleet...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Failed to load fleet</h3>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => { clearErrors(); loadUserStarships(); }}>
            Try Again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("h-full p-6 space-y-8", className)}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between"
      >
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Fleet Command
          </h1>
          <p className="text-muted-foreground">
            Manage your starship fleet and deploy agents across the galaxy
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          size="lg"
          className="relative bg-gradient-to-r from-primary to-primary/80 shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-primary/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="relative flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Launch New Starship
          </div>
        </Button>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex-1 max-w-md"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search starships..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/50 border-border/50"
          />
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex flex-wrap gap-3"
      >
        <Button
          variant={activeFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('all')}
          className="flex items-center gap-2"
        >
          <span>All</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
            {fleetStats.total}
          </Badge>
        </Button>
        <Button
          variant={activeFilter === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('active')}
          className={cn(
            "flex items-center gap-2",
            activeFilter === 'active' ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white' : ''
          )}
        >
          <span>Active</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
            {fleetStats.active}
          </Badge>
        </Button>
        <Button
          variant={activeFilter === 'inactive' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('inactive')}
          className={cn(
            "flex items-center gap-2",
            activeFilter === 'inactive' ? 'bg-slate-600 hover:bg-slate-700 border-slate-600 text-white' : ''
          )}
        >
          <span>Inactive</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
            {fleetStats.inactive}
          </Badge>
        </Button>
        <Button
          variant={activeFilter === 'scout' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('scout')}
          className={cn(
            "flex items-center gap-2",
            activeFilter === 'scout' ? 'bg-violet-600 hover:bg-violet-700 border-violet-600 text-white' : ''
          )}
        >
          <span>Scouts</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
            {fleetStats.scouts}
          </Badge>
        </Button>
        <Button
          variant={activeFilter === 'cruiser' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('cruiser')}
          className={cn(
            "flex items-center gap-2",
            activeFilter === 'cruiser' ? 'bg-amber-600 hover:bg-amber-700 border-amber-600 text-white' : ''
          )}
        >
          <span>Cruisers</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
            {fleetStats.cruisers}
          </Badge>
        </Button>
      </motion.div>

      {/* Starship Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex-1"
      >
        {filteredStarships.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-[400px] flex items-center justify-center"
          >
            <div className="text-center space-y-4">
              <Rocket className="w-16 h-16 text-muted-foreground mx-auto" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">
                  {starships.length === 0 ? 'No starships found' : 'No matching starships'}
                </h3>
                <p className="text-muted-foreground">
                  {starships.length === 0 
                    ? 'Create your first starship to begin your journey across the galaxy'
                    : 'Try adjusting your search criteria'
                  }
                </p>
              </div>
              {starships.length === 0 && (
                <Button
                  onClick={() => setShowCreateModal(true)}
                  size="lg"
                  className="relative bg-gradient-to-r from-primary to-primary/80 shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-primary/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <div className="relative flex items-center">
                    <Zap className="w-5 h-5 mr-2" />
                    Launch Your First Starship
                  </div>
                </Button>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filteredStarships.map((starship, index) => (
                <motion.div
                  key={starship.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <StarshipCard
                    starship={starship}
                    isActive={starship.id === activeStarshipId}
                    viewMode="grid"
                    onSelect={() => handleStarshipSelect(starship.id)}
                    onEdit={() => setEditingStarship(starship.id)}
                    onDelete={() => setDeletingStarship(starship.id)}
                    onStatusChange={() => setStatusManagingStarship(starship.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Modals */}
      <StarshipCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={handleCreateSuccess}
      />

      {editingStarship && (
        <StarshipEditModal
          starshipId={editingStarship}
          open={true}
          onOpenChange={(open) => !open && setEditingStarship(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {deletingStarship && (
        <StarshipDeleteDialog
          starshipId={deletingStarship}
          open={true}
          onOpenChange={(open) => !open && setDeletingStarship(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {statusManagingStarship && (
        <StarshipStatusManager
          starshipId={statusManagingStarship}
          open={true}
          onOpenChange={(open) => !open && setStatusManagingStarship(null)}
          onSuccess={handleStatusUpdateSuccess}
        />
      )}
    </div>
  );
}