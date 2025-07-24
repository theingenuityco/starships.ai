'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  Users,
  TrendingUp,
  Calendar,
  Activity,
  RefreshCw
} from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
// Socket import removed - using HTTP-only implementation

// Local type definitions
interface Expedition {
  id: string;
  starshipId: string;
  title: string;
  description: string;
  objective: string;
  status: 'draft' | 'planning' | 'in-progress' | 'review' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedAgents: string[];
  result?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  estimatedDuration?: number;
  actualDuration?: number;
  tags: string[];
}

interface ExpeditionProgressProps {
  expedition: Expedition;
  showDetails?: boolean;
  enableRealTimeUpdates?: boolean;
}

export function ExpeditionProgress({ expedition, showDetails = true, enableRealTimeUpdates = false }: ExpeditionProgressProps) {
  // HTTP-only implementation - real-time updates disabled
  const [lastUpdate, setLastUpdate] = useState<string>(expedition.updatedAt);

  // HTTP-only implementation: Real-time features disabled
  // Socket integration removed to use HTTP API only
  const isConnected = false; // Always false in HTTP mode
  const currentPhase = null; // Not available in HTTP mode
  const realtimeProgress = null; // Not available in HTTP mode
  
  // Calculate progress based on status
  const getProgress = () => {
    switch (expedition.status) {
      case 'draft': return 0;
      case 'planning': return 20;
      case 'in-progress': return 60;
      case 'review': return 90;
      case 'completed': return 100;
      case 'failed': return 0;
      case 'cancelled': return 0;
      default: return 0;
    }
  };

  // Calculate time metrics
  const getTimeMetrics = () => {
    const now = new Date();
    const createdAt = new Date(expedition.createdAt);
    const updatedAt = new Date(expedition.updatedAt);
    
    const elapsedMinutes = differenceInMinutes(now, createdAt);
    const timeSinceUpdate = differenceInMinutes(now, updatedAt);
    
    return {
      elapsed: elapsedMinutes,
      sinceUpdate: timeSinceUpdate,
      estimated: expedition.estimatedDuration || 0,
      actual: expedition.actualDuration || elapsedMinutes
    };
  };

  // Get status configuration
  const getStatusConfig = (status: Expedition['status']) => {
    switch (status) {
      case 'draft':
        return { 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          icon: AlertCircle, 
          label: 'Draft',
          description: 'Expedition is being prepared'
        };
      case 'planning':
        return { 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          icon: Target, 
          label: 'Planning',
          description: 'First Officer is analyzing requirements'
        };
      case 'in-progress':
        return { 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-100', 
          icon: Activity, 
          label: 'In Progress',
          description: 'Agents are actively working'
        };
      case 'review':
        return { 
          color: 'text-purple-600', 
          bg: 'bg-purple-100', 
          icon: AlertCircle, 
          label: 'Review',
          description: 'Results are being reviewed'
        };
      case 'completed':
        return { 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          icon: CheckCircle, 
          label: 'Completed',
          description: 'Expedition completed successfully'
        };
      case 'failed':
        return { 
          color: 'text-red-600', 
          bg: 'bg-red-100', 
          icon: AlertCircle, 
          label: 'Failed',
          description: 'Expedition encountered errors'
        };
      case 'cancelled':
        return { 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          icon: AlertCircle, 
          label: 'Cancelled',
          description: 'Expedition was cancelled'
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

  const progress = getProgress();
  const timeMetrics = getTimeMetrics();
  const statusConfig = getStatusConfig(expedition.status);
  const StatusIcon = statusConfig.icon;

  // Calculate efficiency
  const efficiency = timeMetrics.estimated > 0 
    ? Math.round((timeMetrics.estimated / Math.max(timeMetrics.actual, 1)) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
              <span>Expedition Progress</span>
              {/* Real-time phase indicators removed - not available in HTTP mode */}
            </div>
            {/* Connection status removed - HTTP mode only */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 text-blue-600">
                <RefreshCw className="h-4 w-4" />
                <span className="text-xs">HTTP Mode</span>
              </div>
            </div>
          </CardTitle>
          <CardDescription>
            {statusConfig.description}
            {/* Real-time progress indicators removed - not available in HTTP mode */}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Progress</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  {progress}%
                </span>
              </div>
            </div>
            <Progress
              value={progress}
              className="h-3 transition-all duration-500"
            />
            {/* Real-time progress details removed - not available in HTTP mode */}
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <Badge className={`${statusConfig.color} ${statusConfig.bg}`}>
              {statusConfig.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Updated {formatDistanceToNow(new Date(expedition.updatedAt), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Time Metrics */}
      {showDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Time Tracking</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.floor(timeMetrics.elapsed / 60)}h {timeMetrics.elapsed % 60}m
                </div>
                <div className="text-sm text-muted-foreground">Elapsed</div>
              </div>
              
              {timeMetrics.estimated > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">
                    {Math.floor(timeMetrics.estimated / 60)}h {timeMetrics.estimated % 60}m
                  </div>
                  <div className="text-sm text-muted-foreground">Estimated</div>
                </div>
              )}
              
              <div className="text-center">
                <div className={`text-2xl font-bold ${efficiency >= 100 ? 'text-green-600' : efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {efficiency}%
                </div>
                <div className="text-sm text-muted-foreground">Efficiency</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {timeMetrics.sinceUpdate}m
                </div>
                <div className="text-sm text-muted-foreground">Since Update</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expedition Details */}
      {showDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Expedition Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Objective</h4>
              <p className="text-sm text-muted-foreground">{expedition.objective}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Priority</h4>
                <Badge variant="outline" className="capitalize">
                  {expedition.priority}
                </Badge>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Assigned Agents</h4>
                <div className="flex items-center space-x-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{expedition.assignedAgents.length} agents</span>
                </div>
              </div>
            </div>

            {expedition.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {expedition.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Created {formatDistanceToNow(new Date(expedition.createdAt), { addSuffix: true })}</span>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>Last activity {formatDistanceToNow(new Date(expedition.updatedAt), { addSuffix: true })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {expedition.result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{expedition.result}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}