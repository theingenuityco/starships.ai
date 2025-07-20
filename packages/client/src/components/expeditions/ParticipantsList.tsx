'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Bot, 
  Crown, 
  User, 
  Activity, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Settings
} from 'lucide-react';
import { agentAPI } from '@/lib/api';

// Local type definitions
interface Agent {
  id: string;
  name: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];
  description?: string;
  model: string;
  isPublic: boolean;
  usageCount: number;
  rating?: number;
}

interface ParticipantsListProps {
  agentIds: string[];
  starshipSlug: string;
  showDetails?: boolean;
  showActivity?: boolean;
}

interface AgentWithStatus extends Agent {
  status: 'active' | 'idle' | 'busy' | 'offline';
  lastActivity?: string;
  currentTask?: string;
  completedTasks: number;
}

export function ParticipantsList({ 
  agentIds, 
  starshipSlug, 
  showDetails = true,
  showActivity = true 
}: ParticipantsListProps) {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load agent details
  useEffect(() => {
    const loadAgents = async () => {
      if (agentIds.length === 0) {
        setAgents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const agentPromises = agentIds.map(async (agentId) => {
          try {
            const agent = await agentAPI.getById(agentId);
            // Mock status and activity data - in real implementation, this would come from the API
            return {
              ...agent,
              status: ['active', 'idle', 'busy'][Math.floor(Math.random() * 3)] as 'active' | 'idle' | 'busy',
              lastActivity: new Date(Date.now() - Math.random() * 3600000).toISOString(),
              currentTask: Math.random() > 0.5 ? `Task ${Math.floor(Math.random() * 100)}` : undefined,
              completedTasks: Math.floor(Math.random() * 10)
            };
          } catch (err) {
            console.error(`Failed to load agent ${agentId}:`, err);
            // Return a placeholder for failed agents
            return {
              id: agentId,
              name: `Agent ${agentId.slice(0, 8)}`,
              category: 'general' as const,
              tags: [],
              model: 'unknown',
              isPublic: false,
              usageCount: 0,
              status: 'offline' as const,
              completedTasks: 0
            };
          }
        });

        const loadedAgents = await Promise.all(agentPromises);
        setAgents(loadedAgents);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load participants';
        setError(errorMessage);
        console.error('[PARTICIPANTS] Failed to load agents:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAgents();
  }, [agentIds]);

  // Get status configuration
  const getStatusConfig = (status: AgentWithStatus['status']) => {
    switch (status) {
      case 'active':
        return { 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          icon: Activity, 
          label: 'Active',
          description: 'Currently working'
        };
      case 'idle':
        return { 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-100', 
          icon: Clock, 
          label: 'Idle',
          description: 'Available for tasks'
        };
      case 'busy':
        return { 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          icon: Settings, 
          label: 'Busy',
          description: 'Working on other tasks'
        };
      case 'offline':
        return { 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          icon: AlertCircle, 
          label: 'Offline',
          description: 'Not available'
        };
      default:
        return { 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          icon: AlertCircle, 
          label: status,
          description: ''
        };
    }
  };

  // Get category configuration
  const getCategoryConfig = (category: Agent['category']) => {
    switch (category) {
      case 'general':
        return { color: 'text-blue-600', label: 'General' };
      case 'coding':
        return { color: 'text-green-600', label: 'Coding' };
      case 'creative':
        return { color: 'text-purple-600', label: 'Creative' };
      case 'analysis':
        return { color: 'text-orange-600', label: 'Analysis' };
      case 'support':
        return { color: 'text-gray-600', label: 'Support' };
      default:
        return { color: 'text-gray-600', label: category };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading participants...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-red-500">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">Error loading participants</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2" />
            <p>No participants assigned</p>
            <p className="text-sm">Agents will be assigned when the expedition starts</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate statistics
  const activeAgents = agents.filter(agent => agent.status === 'active').length;
  const totalTasks = agents.reduce((sum, agent) => sum + agent.completedTasks, 0);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Expedition Participants</span>
          </CardTitle>
          <CardDescription>
            {agents.length} agents assigned • {activeAgents} currently active
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{agents.length}</div>
              <div className="text-sm text-muted-foreground">Total Agents</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{activeAgents}</div>
              <div className="text-sm text-muted-foreground">Active Now</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{totalTasks}</div>
              <div className="text-sm text-muted-foreground">Tasks Completed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participants List */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Details</CardTitle>
          <CardDescription>
            Current status and activity of all expedition participants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agents.map((agent) => {
              const statusConfig = getStatusConfig(agent.status);
              const categoryConfig = getCategoryConfig(agent.category);
              const StatusIcon = statusConfig.icon;

              return (
                <div key={agent.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                  {/* Avatar */}
                  <Avatar className="h-12 w-12 bg-primary/10">
                    <Bot className="h-6 w-6 text-primary" />
                  </Avatar>

                  {/* Agent Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">{agent.name}</h4>
                        <p className="text-sm text-muted-foreground truncate">
                          {agent.description || `${categoryConfig.label} agent`}
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-end space-y-1 ml-4">
                        <Badge variant="outline" className={`${statusConfig.color} ${statusConfig.bg}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                        <Badge variant="outline" className={categoryConfig.color}>
                          {categoryConfig.label}
                        </Badge>
                      </div>
                    </div>

                    {showDetails && (
                      <div className="mt-3 space-y-2">
                        {/* Current Task */}
                        {agent.currentTask && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Current task: </span>
                            <span className="font-medium">{agent.currentTask}</span>
                          </div>
                        )}

                        {/* Skills/Tags */}
                        {agent.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {agent.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {agent.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{agent.tags.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Activity Stats */}
                        {showActivity && (
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="h-4 w-4" />
                              <span>{agent.completedTasks} tasks completed</span>
                            </div>
                            {agent.rating && (
                              <div className="flex items-center space-x-1">
                                <span>★ {agent.rating.toFixed(1)}</span>
                              </div>
                            )}
                            <div className="flex items-center space-x-1">
                              <span>Model: {agent.model}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* First Officer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Crown className="h-5 w-5 text-purple-600" />
            <span>First Officer</span>
          </CardTitle>
          <CardDescription>
            Coordinating and managing the expedition workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <Avatar className="h-12 w-12 bg-purple-100">
              <Crown className="h-6 w-6 text-purple-600" />
            </Avatar>
            <div className="flex-1">
              <h4 className="text-sm font-medium">First Officer AI</h4>
              <p className="text-sm text-muted-foreground">
                Analyzing requirements, coordinating agents, and ensuring quality delivery
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <Badge variant="outline" className="text-purple-600 bg-purple-100">
                  <Activity className="h-3 w-3 mr-1" />
                  Coordinating
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Workflow Management
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}