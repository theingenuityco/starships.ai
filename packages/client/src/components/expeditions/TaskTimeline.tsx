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
  Target
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
}

export function TaskTimeline({ tasks, showDetails = true }: TaskTimelineProps) {
  
  // Sort tasks by creation date and dependencies
  const sortedTasks = [...tasks].sort((a, b) => {
    // First, sort by dependencies (tasks with no dependencies come first)
    if (a.dependencies.length === 0 && b.dependencies.length > 0) return -1;
    if (a.dependencies.length > 0 && b.dependencies.length === 0) return 1;
    
    // Then by creation date
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Get status configuration
  const getStatusConfig = (status: ExpeditionTask['status']) => {
    switch (status) {
      case 'pending':
        return { 
          icon: Circle, 
          color: 'text-gray-500', 
          bg: 'bg-gray-100', 
          label: 'Pending',
          description: 'Waiting to be assigned'
        };
      case 'assigned':
        return { 
          icon: User, 
          color: 'text-blue-500', 
          bg: 'bg-blue-100', 
          label: 'Assigned',
          description: 'Assigned to agent'
        };
      case 'in-progress':
        return { 
          icon: Clock, 
          color: 'text-yellow-500', 
          bg: 'bg-yellow-100', 
          label: 'In Progress',
          description: 'Currently being worked on'
        };
      case 'blocked':
        return { 
          icon: Pause, 
          color: 'text-red-500', 
          bg: 'bg-red-100', 
          label: 'Blocked',
          description: 'Waiting for dependencies'
        };
      case 'review':
        return { 
          icon: AlertCircle, 
          color: 'text-purple-500', 
          bg: 'bg-purple-100', 
          label: 'Review',
          description: 'Under review'
        };
      case 'completed':
        return { 
          icon: CheckCircle, 
          color: 'text-green-500', 
          bg: 'bg-green-100', 
          label: 'Completed',
          description: 'Successfully completed'
        };
      case 'failed':
        return { 
          icon: XCircle, 
          color: 'text-red-500', 
          bg: 'bg-red-100', 
          label: 'Failed',
          description: 'Failed to complete'
        };
      default:
        return { 
          icon: Circle, 
          color: 'text-gray-500', 
          bg: 'bg-gray-100', 
          label: status,
          description: ''
        };
    }
  };

  // Get priority configuration
  const getPriorityConfig = (priority: ExpeditionTask['priority']) => {
    switch (priority) {
      case 'low':
        return { color: 'text-green-600', bg: 'bg-green-100', label: 'Low' };
      case 'medium':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Medium' };
      case 'high':
        return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'High' };
      case 'critical':
        return { color: 'text-red-600', bg: 'bg-red-100', label: 'Critical' };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', label: priority };
    }
  };

  // Calculate overall progress
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2" />
            <p>No tasks have been created yet</p>
            <p className="text-sm">Tasks will appear here once the expedition starts</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Task Progress</span>
            <Badge variant="outline">
              {completedTasks} of {totalTasks} completed
            </Badge>
          </CardTitle>
          <CardDescription>
            Track the progress of individual tasks in this expedition
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Overall Progress</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Task Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Task Timeline</CardTitle>
          <CardDescription>
            Chronological view of all tasks and their current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {sortedTasks.map((task, index) => {
              const statusConfig = getStatusConfig(task.status);
              const priorityConfig = getPriorityConfig(task.priority);
              const StatusIcon = statusConfig.icon;
              const isLast = index === sortedTasks.length - 1;

              return (
                <div key={task.id} className="relative">
                  {/* Timeline connector */}
                  {!isLast && (
                    <div className="absolute left-6 top-12 w-0.5 h-16 bg-border"></div>
                  )}

                  <div className="flex items-start space-x-4">
                    {/* Status Icon */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full ${statusConfig.bg} flex items-center justify-center`}>
                      <StatusIcon className={`h-6 w-6 ${statusConfig.color}`} />
                    </div>

                    {/* Task Content */}
                    <div className="flex-1 min-w-0">
                      <Card className="border-l-4 border-l-primary/20">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base truncate">
                                {task.title}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                {task.description}
                              </CardDescription>
                            </div>
                            <div className="flex flex-col items-end space-y-2 ml-4">
                              <Badge variant="outline" className={`${statusConfig.color} ${statusConfig.bg}`}>
                                {statusConfig.label}
                              </Badge>
                              <Badge variant="outline" className={`${priorityConfig.color} ${priorityConfig.bg}`}>
                                {priorityConfig.label}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>

                        {showDetails && (
                          <CardContent className="space-y-3">
                            {/* Deliverable */}
                            <div>
                              <p className="text-sm font-medium mb-1">Deliverable</p>
                              <p className="text-sm text-muted-foreground">{task.deliverable}</p>
                            </div>

                            {/* Skills and Agent */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm font-medium mb-2">Required Skills</p>
                                <div className="flex flex-wrap gap-1">
                                  {task.requiredSkills.map((skill) => (
                                    <Badge key={skill} variant="outline" className="text-xs">
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              
                              {task.assignedAgentId && (
                                <div>
                                  <p className="text-sm font-medium mb-2">Assigned Agent</p>
                                  <div className="flex items-center space-x-1">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">{task.assignedAgentId.slice(0, 8)}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Dependencies */}
                            {task.dependencies.length > 0 && (
                              <div>
                                <p className="text-sm font-medium mb-2">Dependencies</p>
                                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                  <ArrowRight className="h-4 w-4" />
                                  <span>Depends on {task.dependencies.length} other task(s)</span>
                                </div>
                              </div>
                            )}

                            {/* Time tracking */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center space-x-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {task.estimatedEffort ? `Est: ${task.estimatedEffort}m` : 'No estimate'}
                                </span>
                              </div>
                              {task.actualEffort && (
                                <div className="flex items-center space-x-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    Actual: {task.actualEffort}m
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Result */}
                            {task.result && (
                              <div>
                                <p className="text-sm font-medium mb-2">Result</p>
                                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                                  <p className="text-sm">{task.result}</p>
                                </div>
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                              <span>Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
                              {task.updatedAt !== task.createdAt && (
                                <span>Updated {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</span>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    </div>
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