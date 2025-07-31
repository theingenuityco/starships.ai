'use client';

import React from 'react';
import { Trash2, Activity, Users, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { Expedition, Agent } from '@starships/protocol';

interface ExpeditionCardProps {
  expedition: Expedition;
  agents: Agent[];
  onDelete: (id: string) => void;
  starshipSlug: string;
  className?: string;
}

export function ExpeditionCard({
  expedition,
  agents,
  onDelete,
  starshipSlug,
  className
}: ExpeditionCardProps) {
  const router = useRouter();
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'inactive':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${expedition.name}"?`)) {
      onDelete(expedition.id);
    }
  };

  const handleClick = () => {
    router.push(`/ship/${starshipSlug}/expeditions/${expedition.id}`);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
      onClick={handleClick}
    >
      <Card className={cn(
        "cursor-pointer transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50",
        "hover:shadow-xl hover:border-border/80 hover:bg-card/70",
        className
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  🚀
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{expedition.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", getStatusColor(expedition.status))}
                  >
                    {expedition.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(expedition.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {expedition.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {expedition.description}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              {agents.length > 0 ? (
                <div className="flex items-center">
                  <div className="flex -space-x-2">
                    {agents.slice(0, 3).map((agent, i) => (
                      <Avatar key={agent.id} className="w-6 h-6 border-2 border-background">
                        <AvatarFallback className={cn(
                          "text-xs font-medium text-white",
                          i === 0 && "bg-blue-500",
                          i === 1 && "bg-purple-500",
                          i === 2 && "bg-green-500"
                        )}>
                          {agent.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {agents.length > 3 && (
                      <Avatar className="w-6 h-6 border-2 border-background">
                        <AvatarFallback className="bg-muted text-xs">
                          +{agents.length - 3}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {agents.length} agent{agents.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No agents assigned</span>
              )}
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}