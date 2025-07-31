'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Activity,
  Bot, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Zap,
  Pause,
  PlayCircle,
  StopCircle,
  RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgentAssignment } from '@starships/protocol';

// Agent activity types
type AgentActivityType = 
  | 'task_started' 
  | 'task_completed' 
  | 'task_failed' 
  | 'agent_thinking' 
  | 'agent_blocked'
  | 'quality_check'
  | 'retry_attempt';

interface AgentActivity {
  id: string;
  agentId: string;
  agentName: string;
  type: AgentActivityType;
  taskId?: string;
  taskTitle?: string;
  message: string;
  timestamp: string;
  metadata?: {
    qualityScore?: number;
    duration?: number;
    retryCount?: number;
    blockedReason?: string;
  };
}

interface AgentActivityFeedProps {
  agents: AgentAssignment[];
  activities?: AgentActivity[];
  maxItems?: number;
  showDetails?: boolean;
}

export function AgentActivityFeed({ 
  agents, 
  activities = [], 
  maxItems = 20,
  showDetails = true 
}: AgentActivityFeedProps) {
  
  // Get activity configuration
  const getActivityConfig = (type: AgentActivityType) => {
    switch (type) {
      case 'task_started':
        return { 
          icon: PlayCircle, 
          color: 'text-blue-500', 
          bg: 'bg-blue-100',
          label: 'Started Task'
        };
      case 'task_completed':
        return { 
          icon: CheckCircle, 
          color: 'text-green-500', 
          bg: 'bg-green-100',
          label: 'Completed Task'
        };
      case 'task_failed':
        return { 
          icon: AlertCircle, 
          color: 'text-red-500', 
          bg: 'bg-red-100',
          label: 'Task Failed'
        };
      case 'agent_thinking':
        return { 
          icon: Zap, 
          color: 'text-purple-500', 
          bg: 'bg-purple-100',
          label: 'Processing'
        };
      case 'agent_blocked':
        return { 
          icon: Pause, 
          color: 'text-orange-500', 
          bg: 'bg-orange-100',
          label: 'Blocked'
        };
      case 'quality_check':
        return { 
          icon: RefreshCw, 
          color: 'text-indigo-500', 
          bg: 'bg-indigo-100',
          label: 'Quality Check'
        };
      case 'retry_attempt':
        return { 
          icon: RefreshCw, 
          color: 'text-yellow-500', 
          bg: 'bg-yellow-100',
          label: 'Retrying'
        };
      default:
        return { 
          icon: Activity, 
          color: 'text-gray-500', 
          bg: 'bg-gray-100',
          label: 'Activity'
        };
    }
  };

  // Get agent status based on recent activities
  const getAgentStatus = (agentId: string): 'online' | 'busy' | 'idle' | 'error' => {
    const recentActivities = activities
      .filter(a => a.agentId === agentId)
      .slice(0, 5);
    
    if (recentActivities.some(a => a.type === 'task_failed' || a.type === 'agent_blocked')) {
      return 'error';
    }
    if (recentActivities.some(a => a.type === 'task_started' || a.type === 'agent_thinking')) {
      return 'busy';
    }
    if (recentActivities.length === 0) {
      return 'idle';
    }
    return 'online';
  };

  // Get status badge configuration
  const getStatusBadge = (status: ReturnType<typeof getAgentStatus>) => {
    switch (status) {
      case 'online':
        return { variant: 'outline' as const, className: 'text-green-600 bg-green-100' };
      case 'busy':
        return { variant: 'outline' as const, className: 'text-blue-600 bg-blue-100' };
      case 'idle':
        return { variant: 'outline' as const, className: 'text-gray-600 bg-gray-100' };
      case 'error':
        return { variant: 'outline' as const, className: 'text-red-600 bg-red-100' };
    }
  };

  // Sort activities by timestamp (newest first)
  const sortedActivities = [...activities]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxItems);

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2" />
            <p>No agents assigned yet</p>
            <p className="text-sm">Agent activity will appear here once agents are working</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Status</CardTitle>
          <CardDescription>
            Current status of all assigned agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => {
              const status = getAgentStatus(agent.agentId);
              const statusBadge = getStatusBadge(status);
              const currentTasks = agent.assignedTasks.length;
              
              return (
                <div key={agent.agentId} className="flex items-center space-x-3 p-3 rounded-lg border">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={`/api/agents/${agent.agentId}/avatar`} />
                    <AvatarFallback>
                      <Bot className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium truncate">{agent.agentName}</p>
                      <Badge {...statusBadge} className="text-xs">
                        {status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {currentTasks} task{currentTasks !== 1 ? 's' : ''} assigned • 
                      {Math.round(agent.skillMatch * 100)}% skill match
                    </p>
                  </div>
                  
                  <div className="flex items-center">
                    {status === 'busy' && (
                      <div className="animate-pulse">
                        <Clock className="h-4 w-4 text-blue-500" />
                      </div>
                    )}
                    {status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    {status === 'online' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Activity Feed</span>
            {activities.length > 0 && (
              <Badge variant="outline">
                {activities.length} activities
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Real-time updates from agents working on tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedActivities.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <p className="text-sm">No activity yet. Waiting for agents to start working...</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {sortedActivities.map((activity) => {
                const config = getActivityConfig(activity.type);
                const ActivityIcon = config.icon;
                
                return (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center`}>
                      <ActivityIcon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{activity.agentName}</span>
                            {' '}
                            <span className="text-muted-foreground">{activity.message}</span>
                          </p>
                          
                          {showDetails && activity.taskTitle && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Task: {activity.taskTitle}
                            </p>
                          )}
                          
                          {showDetails && activity.metadata && (
                            <div className="flex items-center space-x-3 mt-1">
                              {activity.metadata.qualityScore !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  Quality: {activity.metadata.qualityScore}%
                                </Badge>
                              )}
                              {activity.metadata.duration !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  Duration: {activity.metadata.duration}m
                                </span>
                              )}
                              {activity.metadata.retryCount !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  Retry #{activity.metadata.retryCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}