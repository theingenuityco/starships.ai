'use client';

import React from 'react';
import { Agent } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpeditionAgentSelectorProps {
  agents: Agent[];
  selectedAgentIds: string[];
  onChange: (agentIds: string[]) => void;
  className?: string;
}

export function ExpeditionAgentSelector({
  agents,
  selectedAgentIds,
  onChange,
  className
}: ExpeditionAgentSelectorProps) {
  const handleToggleAgent = (agentId: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedAgentIds, agentId]);
    } else {
      onChange(selectedAgentIds.filter(id => id !== agentId));
    }
  };

  if (agents.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No agents available for this starship</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {agents.map(agent => (
        <label
          key={agent.id}
          className="flex items-center space-x-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors cursor-pointer"
        >
          <Checkbox
            id={agent.id}
            checked={selectedAgentIds.includes(agent.id)}
            onCheckedChange={(checked) => handleToggleAgent(agent.id, checked as boolean)}
          />
          
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary/10">
              {agent.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{agent.name}</span>
              <Badge variant="outline" className="text-xs">
                {agent.category}
              </Badge>
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground truncate">
                {agent.description}
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}