'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, 
  Users, 
  Target, 
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  FileText
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

interface ExpeditionCardProps {
  expedition: Expedition;
  onClick?: () => void;
  showActions?: boolean;
  onStart?: (expeditionId: string) => void;
  onPause?: (expeditionId: string) => void;
  onCancel?: (expeditionId: string) => void;
}

export function ExpeditionCard({ 
  expedition, 
  onClick, 
  showActions = false,
  onStart,
  onPause,
  onCancel
}: ExpeditionCardProps) {
  
  // Get status styling
  const getStatusConfig = (status: Expedition['status']) => {
    switch (status) {
      case 'draft':
        return { 
          color: 'bg-gray-500', 
          icon: FileText, 
          label: 'Draft',
          variant: 'secondary' as const
        };
      case 'planning':
        return { 
          color: 'bg-blue-500', 
          icon: Target, 
          label: 'Planning',
          variant: 'default' as const
        };
      case 'in-progress':
        return { 
          color: 'bg-yellow-500', 
          icon: Play, 
          label: 'In Progress',
          variant: 'default' as const
        };
      case 'review':
        return { 
          color: 'bg-purple-500', 
          icon: AlertCircle, 
          label: 'Review',
          variant: 'secondary' as const
        };
      case 'completed':
        return { 
          color: 'bg-green-500', 
          icon: CheckCircle, 
          label: 'Completed',
          variant: 'default' as const
        };
      case 'failed':
        return { 
          color: 'bg-red-500', 
          icon: XCircle, 
          label: 'Failed',
          variant: 'destructive' as const
        };
      case 'cancelled':
        return { 
          color: 'bg-gray-500', 
          icon: XCircle, 
          label: 'Cancelled',
          variant: 'secondary' as const
        };
      default:
        return { 
          color: 'bg-gray-500', 
          icon: FileText, 
          label: status,
          variant: 'secondary' as const
        };
    }
  };

  // Get priority styling
  const getPriorityConfig = (priority: Expedition['priority']) => {
    switch (priority) {
      case 'low':
        return { color: 'text-green-600', bg: 'bg-green-100', label: 'Low' };
      case 'medium':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Medium' };
      case 'high':
        return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'High' };
      case 'urgent':
        return { color: 'text-red-600', bg: 'bg-red-100', label: 'Urgent' };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', label: priority };
    }
  };

  const statusConfig = getStatusConfig(expedition.status);
  const priorityConfig = getPriorityConfig(expedition.priority);
  const StatusIcon = statusConfig.icon;

  // Calculate progress (mock calculation based on status)
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

  const progress = getProgress();

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${
        onClick ? 'hover:border-primary/50' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">
              {expedition.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {expedition.description}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end space-y-2 ml-4">
            <Badge variant={statusConfig.variant} className="flex items-center space-x-1">
              <StatusIcon className="h-3 w-3" />
              <span>{statusConfig.label}</span>
            </Badge>
            <Badge 
              variant="outline" 
              className={`${priorityConfig.color} ${priorityConfig.bg} border-current`}
            >
              {priorityConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Objective */}
        <div className="flex items-start space-x-2">
          <Target className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground line-clamp-2">
            {expedition.objective}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {expedition.assignedAgents.length} agents
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {expedition.estimatedDuration ? `${expedition.estimatedDuration}m` : 'No estimate'}
            </span>
          </div>
        </div>

        {/* Tags */}
        {expedition.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {expedition.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {expedition.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{expedition.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3" />
            <span>Created {formatDistanceToNow(new Date(expedition.createdAt), { addSuffix: true })}</span>
          </div>
          {expedition.updatedAt !== expedition.createdAt && (
            <span>Updated {formatDistanceToNow(new Date(expedition.updatedAt), { addSuffix: true })}</span>
          )}
        </div>

        {/* Action Buttons */}
        {showActions && (
          <div className="flex space-x-2 pt-2">
            {expedition.status === 'draft' && onStart && (
              <Button 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onStart(expedition.id);
                }}
              >
                <Play className="h-3 w-3 mr-1" />
                Start
              </Button>
            )}
            {expedition.status === 'in-progress' && onPause && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause(expedition.id);
                }}
              >
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
            )}
            {['draft', 'planning', 'in-progress'].includes(expedition.status) && onCancel && (
              <Button 
                size="sm" 
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(expedition.id);
                }}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}