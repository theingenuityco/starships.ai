'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Activity,
  Users,
  Zap,
  Navigation,
  Settings,
  Rocket,
  Circle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Command
} from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';
import type { Starship } from '@/lib/api';

interface StarshipCardProps {
  starship: Starship;
  isActive: boolean;
  viewMode: 'grid' | 'list';
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: () => void;
}

export function StarshipCard({
  starship,
  isActive,
  viewMode,
  onSelect,
  onEdit,
  onDelete,
  onStatusChange
}: StarshipCardProps) {
  const router = useRouter();
  const { starshipAgents, getStarshipAgents } = useStarshipStore();
  const [isHovered, setIsHovered] = useState(false);

  // Get agent data for this starship
  const agentData = starshipAgents[starship.id];
  const deployedAgents = agentData?.deployedAgents || [];
  const availableSlots = agentData?.availableSlots || starship.maxAgents || 0;

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-3 h-3" />;
      case 'docked': return <Circle className="w-3 h-3" />;
      case 'maintenance': return <AlertCircle className="w-3 h-3" />;
      default: return <XCircle className="w-3 h-3" />;
    }
  };

  const getClassColor = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout' 
      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      : 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  };

  const handleCardClick = () => {
    onSelect();
    // Load agent data when selecting a starship
    if (!agentData) {
      getStarshipAgents(starship.id);
    }
    // Navigate to the starship's command deck
    router.push(`/ship/${starship.slug}/command-deck`);
  };

  const handleCommandDeckClick = () => {
    router.push(`/ship/${starship.slug}/command-deck`);
  };

  if (viewMode === 'list') {
    return (
      <motion.div
        whileHover={{ scale: 1.01 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
      >
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
            isActive && "ring-2 ring-primary/50 bg-primary/5",
            isHovered && "shadow-lg border-border/80"
          )}
          onClick={handleCardClick}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-2xl">{getStarshipIcon(starship.class)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold truncate">{starship.name}</h3>
                    {isActive && (
                      <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="outline" className={getStatusColor(starship.status)}>
                      {getStatusIcon(starship.status)}
                      {starship.status}
                    </Badge>
                    <Badge variant="outline" className={getClassColor(starship.class)}>
                      {starship.class}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-sm font-medium">{starship.powerLevel}%</div>
                  <div className="text-xs text-muted-foreground">Power</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">{deployedAgents.length}/{starship.maxAgents}</div>
                  <div className="text-xs text-muted-foreground">Agents</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">{starship.activeExpeditions}</div>
                  <div className="text-xs text-muted-foreground">Expeditions</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">{starship.sibilInsights}</div>
                  <div className="text-xs text-muted-foreground">Insights</div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCommandDeckClick(); }}>
                      <Command className="w-4 h-4 mr-2" />
                      Command Deck
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(); }}>
                      <Activity className="w-4 h-4 mr-2" />
                      Change Status
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <Card 
        className={cn(
          "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
          isActive && "ring-2 ring-primary/50 bg-primary/5",
          isHovered && "shadow-lg border-border/80"
        )}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">{getStarshipIcon(starship.class)}</div>
              <div>
                <CardTitle className="text-lg">{starship.name}</CardTitle>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant="outline" className={getStatusColor(starship.status)}>
                    {getStatusIcon(starship.status)}
                    {starship.status}
                  </Badge>
                  <Badge variant="outline" className={getClassColor(starship.class)}>
                    {starship.class}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isActive && (
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                  Active
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCommandDeckClick(); }}>
                    <Command className="w-4 h-4 mr-2" />
                    Command Deck
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(); }}>
                    <Activity className="w-4 h-4 mr-2" />
                    Change Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Power Level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Power Level</span>
              </div>
              <span className="text-sm font-mono">{starship.powerLevel}%</span>
            </div>
            <Progress value={starship.powerLevel} className="h-2" />
          </div>

          {/* Agent Deployment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">Agent Deployment</span>
              </div>
              <span className="text-sm font-mono">
                {deployedAgents.length}/{starship.maxAgents}
              </span>
            </div>
            <Progress 
              value={(deployedAgents.length / (starship.maxAgents || 1)) * 100} 
              className="h-2" 
            />
            <div className="flex space-x-1">
              {Array.from({ length: starship.maxAgents || 0 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full",
                    i < deployedAgents.length 
                      ? "bg-blue-500" 
                      : "bg-muted border border-border"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-muted-foreground">
                <Navigation className="w-3 h-3" />
                <span className="text-xs">Expeditions</span>
              </div>
              <div className="text-lg font-semibold">{starship.activeExpeditions}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span className="text-xs">Insights</span>
              </div>
              <div className="text-lg font-semibold">{starship.sibilInsights}</div>
            </div>
          </div>

          {/* Created Date */}
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
            Created {new Date(starship.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}