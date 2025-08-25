'use client';

import React, { useState, useEffect } from 'react';
import { Search, Rocket, AlertCircle, Filter, Check, Activity, User, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useStarshipStore } from '@/store/starship-store';
import { useStarshipsLoader } from '@/hooks/useStarshipsLoader';
import { StarshipCard } from './StarshipCard';
import { StarshipCreateModalUnified } from './StarshipCreateModalUnified';
import { StarshipEditModal } from './StarshipEditModal';
import { StarshipDeleteDialog } from './StarshipDeleteDialog';
import { StarshipStatusManager } from './StarshipStatusManager';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { LogoutLink } from '@kinde-oss/kinde-auth-nextjs/components';
import { usePathname } from 'next/navigation';

interface StarshipDashboardProps {
  className?: string;
  autoOpenCreate?: boolean;
  onCreateSuccess?: () => void;
}

export function StarshipDashboard({ className, autoOpenCreate = false, onCreateSuccess }: StarshipDashboardProps) {
  const {
    starships,
    activeStarshipId,
    loading,
    error,
    setActiveStarship,
    clearErrors
  } = useStarshipStore();

  const { user, userName, userEmail, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Use the centralized loader hook with controlled refetch behavior
  const { loadStarships, isLoading: loadingStarships } = useStarshipsLoader({
    enabled: true,
    refetchOnWindowFocus: true,
    refetchOnVisibilityChange: true
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive' | 'scout' | 'cruiser'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStarship, setEditingStarship] = useState<string | null>(null);
  const [deletingStarship, setDeletingStarship] = useState<string | null>(null);
  const [statusManagingStarship, setStatusManagingStarship] = useState<string | null>(null);

  // Only reload when pathname changes to /fleet
  useEffect(() => {
    if (pathname === '/fleet') {
      // Small delay to ensure navigation is complete
      setTimeout(() => loadStarships(), 100);
    }
  }, [pathname]);

  // Auto-open create modal for onboarding
  useEffect(() => {
    if (autoOpenCreate && !loading) {
      // Small delay to ensure everything is loaded
      setTimeout(() => {
        setShowCreateModal(true);
      }, 500);
    }
  }, [autoOpenCreate, loading]);
  
  // Close modal when autoOpenCreate becomes false
  useEffect(() => {
    if (!autoOpenCreate && showCreateModal) {
      setShowCreateModal(false);
    }
  }, [autoOpenCreate]);

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

  const handleCreateSuccess = async () => {
    setShowCreateModal(false);
    // Call the parent's success handler first if provided (for onboarding cleanup)
    if (onCreateSuccess) {
      onCreateSuccess();
    }
    // Refresh the starships list after creation with a small delay to avoid race conditions
    // This ensures the modal close animation completes and avoids conflicting with auto-refresh
    setTimeout(() => {
      if (!loading) {
        loadStarships();
      }
    }, 300);
  };

  const handleEditSuccess = () => {
    setEditingStarship(null);
    // Refresh the starships list after edit
    loadStarships();
  };

  const handleDeleteSuccess = () => {
    setDeletingStarship(null);
    // Refresh the starships list after deletion
    loadStarships();
  };

  const handleStatusUpdateSuccess = () => {
    setStatusManagingStarship(null);
    // Refresh the starships list after status update
    loadStarships();
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
      <div className={cn("h-full flex items-center justify-center bg-gradient-to-br from-background to-muted/5", className)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 p-8 rounded-2xl">
              <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium">Loading Fleet Command</p>
            <p className="text-sm text-muted-foreground">Initializing starship systems...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("h-full flex items-center justify-center bg-gradient-to-br from-background to-muted/5", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-background/60 backdrop-blur-sm border-border/50 p-8 max-w-md">
            <CardContent className="text-center space-y-6">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-destructive/10 blur-xl" />
                <div className="relative bg-gradient-to-br from-destructive/20 to-destructive/10 p-4 rounded-2xl">
                  <AlertCircle className="w-12 h-12 text-destructive" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Unable to Access Fleet</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button 
                onClick={() => { clearErrors(); loadStarships(); }}
                className="bg-primary/90 hover:bg-primary"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("h-screen w-screen flex flex-col overflow-hidden", className)}>
      {/* Full-width Navbar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-br from-background via-background/95 to-muted/5 border-b border-border/40">
        <div className="relative overflow-hidden">
          {/* Background gradient effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />
          
          <div className="relative w-full px-8 py-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/5 blur-sm" />
                    <div className="relative bg-gradient-to-br from-primary/15 to-primary/10 p-3 rounded-xl shadow-sm border border-primary/15">
                      <Rocket className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Fleet Command
                    </h1>
                    <p className="text-sm text-muted-foreground">Manage your starship fleet and deploy agents across the galaxy</p>
                  </div>
                </div>
                
                {/* Fleet Stats - Moved from below */}
                <div className="flex items-center gap-4 px-6 py-3 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent backdrop-blur-sm border border-primary/15 rounded-lg shadow-sm">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/15 blur-sm" />
                    <div className="relative bg-gradient-to-br from-primary/25 to-primary/15 p-2 rounded-lg">
                      <Activity className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground">Fleet Status</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{fleetStats.total}</span>
                        <span className="text-xs text-muted-foreground">Total</span>
                      </div>
                      <div className="h-4 w-px bg-border/30" />
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-emerald-500">{fleetStats.active}</span>
                        <span className="text-xs text-muted-foreground">Active</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">

                {/* User Profile Dropdown */}
                {isAuthenticated && user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-3 px-4 py-2 h-auto hover:bg-primary/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{userName}</p>
                          <p className="text-xs text-muted-foreground">{userEmail}</p>
                        </div>
                        <div className="relative">
                          <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background"></div>
                        </div>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-2 bg-background/95 backdrop-blur-md border-border/40 shadow-xl">
                    <DropdownMenuItem 
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                    >
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">My Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-2 bg-border/30" />
                    <LogoutLink>
                      <DropdownMenuItem 
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-destructive/10 hover:text-destructive cursor-pointer transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="font-medium">Sign out</span>
                      </DropdownMenuItem>
                    </LogoutLink>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-gradient-to-br from-background to-muted/5 pt-28 pb-8">
        <div className="max-w-[1920px] mx-auto px-8 py-8 space-y-8">

        {/* Search, Filter and Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-4 items-center"
        >
          {/* Launch Button, Search Bar and Filter */}
          <div className="flex gap-3 flex-1">
            {/* Launch New Starship Button */}
            <Button
              onClick={() => setShowCreateModal(true)}
              size="default"
              className="h-12 px-6 relative bg-gradient-to-r from-primary to-primary/80 shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden group whitespace-nowrap"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-primary/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="relative flex items-center">
                <Rocket className="w-4 h-4 mr-2" />
                Launch New Starship
              </div>
            </Button>
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-xl">
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10">
                <Search className="w-4 h-4" />
              </div>
              <Input
                placeholder="Search starships..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 h-12 bg-background border-2 border-primary/30 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md"
              />
            </div>
            
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="default"
                  className="h-12 px-6 bg-background border-2 border-primary/30 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md gap-2"
                >
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">
                    {activeFilter === 'all' && 'All Starships'}
                    {activeFilter === 'active' && 'Active'}
                    {activeFilter === 'inactive' && 'Inactive'}
                    {activeFilter === 'scout' && 'Scouts'}
                    {activeFilter === 'cruiser' && 'Cruisers'}
                  </span>
                  <Badge variant="secondary" className="ml-1 h-6 px-2 text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                    {activeFilter === 'all' && fleetStats.total}
                    {activeFilter === 'active' && fleetStats.active}
                    {activeFilter === 'inactive' && fleetStats.inactive}
                    {activeFilter === 'scout' && fleetStats.scouts}
                    {activeFilter === 'cruiser' && fleetStats.cruisers}
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2 bg-background/95 backdrop-blur-md border-border/40 shadow-xl">
                <DropdownMenuItem 
                  onClick={() => setActiveFilter('all')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {activeFilter === 'all' && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn("font-medium", activeFilter !== 'all' ? 'ml-7' : '')}>All Starships</span>
                  </span>
                  <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold bg-muted/50">
                    {fleetStats.total}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveFilter('active')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {activeFilter === 'active' && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn(
                      "flex items-center gap-2.5 font-medium",
                      activeFilter !== 'active' ? 'ml-7' : ''
                    )}>
                      <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-sm" />
                      Active
                    </span>
                  </span>
                  <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    {fleetStats.active}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveFilter('inactive')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {activeFilter === 'inactive' && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn(
                      "flex items-center gap-2.5 font-medium",
                      activeFilter !== 'inactive' ? 'ml-7' : ''
                    )}>
                      <div className="w-2 h-2 bg-slate-500 rounded-full shadow-sm" />
                      Inactive
                    </span>
                  </span>
                  <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold bg-slate-500/10 text-slate-600 border-slate-500/20">
                    {fleetStats.inactive}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveFilter('scout')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {activeFilter === 'scout' && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn(
                      "flex items-center gap-2.5 font-medium",
                      activeFilter !== 'scout' ? 'ml-7' : ''
                    )}>
                      <Rocket className="w-3.5 h-3.5 text-blue-500" />
                      Scouts
                    </span>
                  </span>
                  <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold bg-blue-500/10 text-blue-600 border-blue-500/20">
                    {fleetStats.scouts}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveFilter('cruiser')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {activeFilter === 'cruiser' && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn(
                      "flex items-center gap-2.5 font-medium",
                      activeFilter !== 'cruiser' ? 'ml-7' : ''
                    )}>
                      <Rocket className="w-3.5 h-3.5 text-purple-500" />
                      Cruisers
                    </span>
                  </span>
                  <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold bg-purple-500/10 text-purple-600 border-purple-500/20">
                    {fleetStats.cruisers}
                  </Badge>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.div>


        {/* Starship Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex-1 mt-4 mb-8"
        >
        {filteredStarships.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-[400px] flex items-center justify-center"
          >
            <Card className="bg-background/60 backdrop-blur-sm border-border/50 p-8 max-w-md">
              <CardContent className="text-center space-y-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-primary/10 blur-xl" />
                  <div className="relative bg-gradient-to-br from-primary/20 to-primary/10 p-4 rounded-2xl">
                    <Rocket className="w-12 h-12 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {starships.length === 0 ? 'Launch Your Fleet' : 'No Matching Starships'}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {starships.length === 0 
                      ? 'Begin your journey across the galaxy by launching your first starship'
                      : 'Try adjusting your search criteria or filters'
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
                      <Rocket className="w-5 h-5 mr-2" />
                      Launch Your First Starship
                    </div>
                  </Button>
                )}
              </CardContent>
            </Card>
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
        </div>
      </div>

      {/* Modals */}
      <StarshipCreateModalUnified
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={handleCreateSuccess}
        isOnboarding={autoOpenCreate}
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