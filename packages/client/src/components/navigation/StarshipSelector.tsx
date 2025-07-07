'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface StarshipSelectorProps {
  className?: string;
}

export function StarshipSelector({ className }: StarshipSelectorProps) {
  const {
    starships,
    activeStarshipId,
    loading,
    error,
    loadUserStarships,
    setActiveStarship,
    createStarship
  } = useStarshipStore();

  const [isCreatingStarship, setIsCreatingStarship] = useState(false);

  // Load starships on mount
  useEffect(() => {
    loadUserStarships();
  }, [loadUserStarships]);

  const activeStarship = starships.find(s => s.id === activeStarshipId);

  const handleCreateStarship = async (starshipClass: 'scout' | 'cruiser') => {
    setIsCreatingStarship(true);
    try {
      await createStarship({
        name: `${starshipClass.charAt(0).toUpperCase() + starshipClass.slice(1)} ${Date.now()}`,
        class: starshipClass
      });
    } catch (error) {
      console.error('Failed to create starship:', error);
    } finally {
      setIsCreatingStarship(false);
    }
  };

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout' ? '🚀' : '🛸';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'docked': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'maintenance': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (loading && starships.length === 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="w-4 h-4 border-2 border-t-transparent border-white/20 rounded-full animate-spin" />
        <span className="text-sm text-white/60">Loading starships...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-sm text-red-400">Error: {error}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadUserStarships()}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-3 px-4 py-2 bg-black/20 border-white/10 hover:bg-white/5 hover:border-white/20"
          >
            {activeStarship ? (
              <>
                <span className="text-lg">{getStarshipIcon(activeStarship.class)}</span>
                <div className="flex flex-col items-start">
                  <span className="font-medium text-white">{activeStarship.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-xs", getStatusColor(activeStarship.status))}
                    >
                      {activeStarship.status}
                    </Badge>
                    <span className="text-xs text-white/60 capitalize">{activeStarship.class}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 text-white/60" />
                <span className="text-white/60">Select Starship</span>
              </>
            )}
            <ChevronDown className="w-4 h-4 text-white/40" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-[280px] bg-black/90 border-white/10 backdrop-blur-sm"
        >
          {starships.length > 0 && (
            <>
              {starships.map((starship) => (
                <DropdownMenuItem
                  key={starship.id}
                  onClick={() => setActiveStarship(starship.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-white/5 focus:bg-white/5",
                    activeStarshipId === starship.id && "bg-white/10"
                  )}
                >
                  <span className="text-lg">{getStarshipIcon(starship.class)}</span>
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{starship.name}</span>
                      <span className="text-xs text-white/60">{starship.powerLevel}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", getStatusColor(starship.status))}
                      >
                        {starship.status}
                      </Badge>
                      <span className="text-xs text-white/60 capitalize">{starship.class}</span>
                      <span className="text-xs text-white/40">
                        {starship.activeExpeditions} expeditions
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="border-white/10" />
            </>
          )}

          <DropdownMenuItem
            onClick={() => handleCreateStarship('scout')}
            disabled={isCreatingStarship}
            className="flex items-center gap-3 px-3 py-2 text-blue-400 hover:bg-blue-500/10 focus:bg-blue-500/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Scout Starship</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleCreateStarship('cruiser')}
            disabled={isCreatingStarship}
            className="flex items-center gap-3 px-3 py-2 text-purple-400 hover:bg-purple-500/10 focus:bg-purple-500/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Cruiser Starship</span>
          </DropdownMenuItem>

          {starships.length === 0 && (
            <div className="px-3 py-6 text-center text-white/60">
              <Rocket className="w-8 h-8 mx-auto mb-2 text-white/40" />
              <p className="text-sm">No starships found</p>
              <p className="text-xs text-white/40">Create your first starship above</p>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {loading && (
        <div className="w-4 h-4 border-2 border-t-transparent border-white/20 rounded-full animate-spin" />
      )}
    </div>
  );
}