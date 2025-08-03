'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  Circle, 
  Clock, 
  User, 
  AlertCircle, 
  Pause,
  XCircle,
  ArrowRight,
  Target,
  Calendar,
  Timer
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ChatMessageMarkdown } from './ChatMessageMarkdown';

// Local type definitions
interface ExpeditionTask {
  id: string;
  expeditionId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  assignedAgentId?: string;
  status: 'pending' | 'assigned' | 'in-progress' | 'blocked' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  deliverable: string;
  result?: string;
  estimatedEffort?: number;
  actualEffort?: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}

interface TaskTimelineProps {
  tasks: ExpeditionTask[];
  showDetails?: boolean;
  agentDetails?: Record<string, { id: string; name: string; category?: string }>;
}

export function TaskTimeline({ tasks, showDetails = true, agentDetails = {} }: TaskTimelineProps) {
  
  // Sort tasks by creation date and dependencies
  const sortedTasks = [...tasks].sort((a, b) => {
    // First, sort by dependencies (tasks with no dependencies come first)
    if (a.dependencies.length === 0 && b.dependencies.length > 0) return -1;
    if (a.dependencies.length > 0 && b.dependencies.length === 0) return 1;
    
    // Then by creation date
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Get status configuration with proper theme support
  const getStatusConfig = (status: ExpeditionTask['status']) => {
    switch (status) {
      case 'pending':
        return { 
          icon: Circle, 
          color: 'text-muted-foreground', 
          bg: 'bg-muted', 
          border: 'border-muted-foreground/20',
          label: 'Pending',
          description: 'Waiting to be assigned'
        };
      case 'assigned':
        return { 
          icon: User, 
          color: 'text-blue-600 dark:text-blue-400', 
          bg: 'bg-blue-100 dark:bg-blue-900/30', 
          border: 'border-blue-200 dark:border-blue-700',
          label: 'Assigned',
          description: 'Assigned to agent'
        };
      case 'in-progress':
        return { 
          icon: Clock, 
          color: 'text-amber-600 dark:text-amber-400', 
          bg: 'bg-amber-100 dark:bg-amber-900/30', 
          border: 'border-amber-200 dark:border-amber-700',
          label: 'In Progress',
          description: 'Currently being worked on'
        };
      case 'blocked':
        return { 
          icon: Pause, 
          color: 'text-red-600 dark:text-red-400', 
          bg: 'bg-red-100 dark:bg-red-900/30', 
          border: 'border-red-200 dark:border-red-700',
          label: 'Blocked',
          description: 'Waiting for dependencies'
        };
      case 'review':
        return { 
          icon: AlertCircle, 
          color: 'text-purple-600 dark:text-purple-400', 
          bg: 'bg-purple-100 dark:bg-purple-900/30', 
          border: 'border-purple-200 dark:border-purple-700',
          label: 'Review',
          description: 'Under review'
        };
      case 'completed':
        return { 
          icon: CheckCircle, 
          color: 'text-emerald-600 dark:text-emerald-400', 
          bg: 'bg-emerald-100 dark:bg-emerald-900/30', 
          border: 'border-emerald-200 dark:border-emerald-700',
          label: 'Completed',
          description: 'Successfully completed'
        };
      case 'failed':
        return { 
          icon: XCircle, 
          color: 'text-red-600 dark:text-red-400', 
          bg: 'bg-red-100 dark:bg-red-900/30', 
          border: 'border-red-200 dark:border-red-700',
          label: 'Failed',
          description: 'Failed to complete'
        };
      default:
        return { 
          icon: Circle, 
          color: 'text-muted-foreground', 
          bg: 'bg-muted', 
          border: 'border-muted-foreground/20',
          label: status,
          description: ''
        };
    }
  };

  // Get priority configuration with theme support
  const getPriorityConfig = (priority: ExpeditionTask['priority']) => {
    switch (priority) {
      case 'low':
        return { 
          color: 'text-emerald-700 dark:text-emerald-300', 
          bg: 'bg-emerald-50 dark:bg-emerald-950/50', 
          border: 'border-emerald-200 dark:border-emerald-800',
          label: 'Low' 
        };
      case 'medium':
        return { 
          color: 'text-amber-700 dark:text-amber-300', 
          bg: 'bg-amber-50 dark:bg-amber-950/50', 
          border: 'border-amber-200 dark:border-amber-800',
          label: 'Medium' 
        };
      case 'high':
        return { 
          color: 'text-orange-700 dark:text-orange-300', 
          bg: 'bg-orange-50 dark:bg-orange-950/50', 
          border: 'border-orange-200 dark:border-orange-800',
          label: 'High' 
        };
      case 'critical':
        return { 
          color: 'text-red-700 dark:text-red-300', 
          bg: 'bg-red-50 dark:bg-red-950/50', 
          border: 'border-red-200 dark:border-red-800',
          label: 'Critical' 
        };
      default:
        return { 
          color: 'text-muted-foreground', 
          bg: 'bg-muted/50', 
          border: 'border-muted-foreground/20',
          label: priority 
        };
    }
  };

  // Calculate overall progress
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-full max-w-md border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Target className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Tasks Available</h3>
            <p className="text-sm text-muted-foreground text-center">
              Tasks will appear here once the expedition planning is complete
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overall Progress */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Progress Overview</CardTitle>
                <CardDescription>Track completion across all tasks</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1">
              {completedTasks}/{totalTasks} complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Overall Progress</span>
              <span className="text-sm font-bold text-primary">{overallProgress}%</span>
            </div>
            <Progress 
              value={overallProgress} 
              className="h-2 bg-muted/30" 
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="text-center">
                <div className="text-sm font-medium text-muted-foreground">Total</div>
                <div className="text-lg font-bold">{totalTasks}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Completed</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-amber-600 dark:text-amber-400">In Progress</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {tasks.filter(t => t.status === 'in-progress').length}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted-foreground">Pending</div>
                <div className="text-lg font-bold text-muted-foreground">
                  {tasks.filter(t => ['pending', 'assigned'].includes(t.status)).length}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Timeline */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-6">
          <CardTitle className="text-lg">Task Timeline</CardTitle>
          <CardDescription>
            Chronological view of all expedition tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {sortedTasks.map((task, index) => {
              const statusConfig = getStatusConfig(task.status);
              const priorityConfig = getPriorityConfig(task.priority);
              const StatusIcon = statusConfig.icon;
              const isLast = index === sortedTasks.length - 1;

              return (
                <div key={task.id} className="group">
                  {/* Task Content */}
                  <div className="flex-1 min-w-0 pb-4">
                    <Card className="border-l-4 border-l-primary/30 shadow-sm hover:shadow-md transition-all duration-200 bg-card">
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base font-semibold text-foreground line-clamp-2">
                                {task.title}
                              </CardTitle>
                              <CardDescription className="mt-2 text-sm leading-relaxed">
                                {task.description}
                              </CardDescription>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Badge 
                                variant="outline" 
                                className={`${priorityConfig.color} ${priorityConfig.bg} ${priorityConfig.border} font-medium px-3 py-1`}
                              >
                                {priorityConfig.label}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>

                        {showDetails && (
                          <CardContent className="space-y-6">
                            {/* Deliverable */}
                            <div className="rounded-lg bg-muted/30 dark:bg-muted/20 p-4">
                              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Target className="h-4 w-4" />
                                Deliverable
                              </h4>
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {task.deliverable}
                              </p>
                            </div>

                            {/* Skills and Agent */}
                            <div className="flex item-center justify-between">
                              {/* Required Skills */}
                              <div>
                                <h4 className="text-sm font-semibold mb-3">Required Skills</h4>
                                <div className="flex flex-wrap gap-2">
                                  {task.requiredSkills.map((skill) => (
                                    <Badge 
                                      key={skill} 
                                      variant="secondary" 
                                      className="text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"
                                    >
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Assigned Agent */}
                              {task.assignedAgentId && (
                                <div>
                                  <h4 className="text-sm font-semibold mb-3">Assigned Agent</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {agentDetails[task.assignedAgentId]?.name || task.assignedAgentId.slice(0, 8)}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Dependencies */}
                            {task.dependencies.length > 0 && (
                              <div className="border-l-4 border-l-amber-200 dark:border-l-amber-700 pl-4 py-2 bg-amber-50/50 dark:bg-amber-950/30 rounded-r-lg">
                                <h4 className="text-sm font-semibold mb-2 text-amber-800 dark:text-amber-200 flex items-center gap-2">
                                  <ArrowRight className="h-4 w-4" />
                                  Dependencies
                                </h4>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                  Depends on {task.dependencies.length} other task{task.dependencies.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            )}

                            {/* Time tracking */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">Estimated Time</span>
                                <span className="text-sm text-muted-foreground">
                                  {task.estimatedEffort ? `${task.estimatedEffort} min` : 'Not estimated'}
                                </span>
                              </div>
                              
                              {task.actualEffort && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold">Actual Time</span>
                                  <span className="text-sm text-muted-foreground">
                                    {task.actualEffort} min
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Result */}
                            {task.result && (
                              <div>
                                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  Result
                                </h4>
                                <div className="p-4 bg-gradient-to-r from-emerald-50 to-emerald-50/50 dark:from-emerald-950/30 dark:to-emerald-950/10 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                  <div className="text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
                                    <ChatMessageMarkdown 
                                      content={task.result} 
                                      isUser={false}
                                      messageType="default"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="pt-3 border-t border-border/50">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span>Created</span>
                                </div>
                                <span className="font-medium text-foreground">
                                  {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                              {task.updatedAt !== task.createdAt && (
                                <div className="flex items-center justify-between text-xs mt-1.5">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>Updated</span>
                                  </div>
                                  <span className="font-medium text-foreground">
                                    {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}