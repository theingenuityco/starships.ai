'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  FileText,
  MoreVertical,
  Star,
  TrendingUp,
  Activity,
  Zap,
  Eye,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  MessageSquare,
  BarChart3,
  Shield,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEnhancedExpeditionSocket } from '@/hooks/useEnhancedExpeditionSocket';
import { expeditionAPI } from '@/lib/expeditionApi';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import type {
  Expedition,
  ExpeditionTask,
  ExpeditionStatus,
  ExpeditionPriority,
  QualityScore
} from '@starships/protocol';

// Enhanced interfaces
interface Agent {
  id: string;
  name: string;
  category: string;
  tags: string[];
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
}

interface ExpeditionCardProps {
  expedition: Expedition;
  onClick?: () => void;
  showActions?: boolean;
  enableRealTimeUpdates?: boolean;
  enableContextMenu?: boolean;
  showAgentAvatars?: boolean;
  showQualityScore?: boolean;
  showTaskProgress?: boolean;
  onStart?: (expeditionId: string) => Promise<boolean>;
  onPause?: (expeditionId: string) => Promise<boolean>;
  onResume?: (expeditionId: string) => Promise<boolean>;
  onCancel?: (expeditionId: string) => Promise<boolean>;
  onEdit?: (expeditionId: string) => void;
  onDelete?: (expeditionId: string) => void;
  onDuplicate?: (expeditionId: string) => void;
  onViewDetails?: (expeditionId: string) => void;
  onViewChat?: (expeditionId: string) => void;
  onViewAnalytics?: (expeditionId: string) => void;
  agents?: Agent[];
  tasks?: ExpeditionTask[];
  qualityScore?: QualityScore;
  className?: string;
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'default';
}

// Action Button Component
const ActionButton: React.FC<ActionButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  variant = 'outline',
  disabled = false,
  loading = false,
  size = 'sm'
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={onClick}
          disabled={disabled || loading}
          className="h-8 w-8 p-0"
          aria-label={label}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// Main ExpeditionCard Component
export function ExpeditionCard({
  expedition,
  onClick,
  showActions = false,
  enableRealTimeUpdates = true,
  enableContextMenu = true,
  showAgentAvatars = true,
  showQualityScore = true,
  showTaskProgress = true,
  onStart,
  onPause,
  onResume,
  onCancel,
  onEdit,
  onDelete,
  onDuplicate,
  onViewDetails,
  onViewChat,
  onViewAnalytics,
  agents = [],
  tasks = [],
  qualityScore,
  className = ''
}: ExpeditionCardProps) {

  // State management
  const [isHovered, setIsHovered] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [localExpedition, setLocalExpedition] = useState(expedition);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Real-time updates via enhanced socket with connection management
  const {
    isConnected,
    connectionState,
    connectionQuality,
    realtimeData,
    getHealthStatus,
    getOfflineQueueStatus,
    getCircuitBreakerStatus,
    forceReconnect,
    resetCircuitBreaker,
    clearOfflineQueue,
    error: socketError
  } = useEnhancedExpeditionSocket({
    expeditionId: enableRealTimeUpdates ? expedition.id : undefined,
    autoJoin: enableRealTimeUpdates,
    enableReconnection: true,
    debugMode: false,
    onExpeditionStarted: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'in-progress' as ExpeditionStatus }));
      }
    },
    onExpeditionPaused: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'paused' as ExpeditionStatus }));
      }
    },
    onExpeditionResumed: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'in-progress' as ExpeditionStatus }));
      }
    },
    onExpeditionCompleted: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'completed' as ExpeditionStatus }));
      }
    },
    onExpeditionCancelled: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'cancelled' as ExpeditionStatus }));
      }
    },
    onExpeditionFailed: (event) => {
      if (event.expeditionId === expedition.id) {
        setLocalExpedition(prev => ({ ...prev, status: 'failed' as ExpeditionStatus }));
      }
    },
    onStatusUpdate: (event) => {
      if (event.expeditionId === expedition.id) {
        // Update progress or other status information
        console.log('Status update for expedition:', event);
      }
    },
    onError: (event) => {
      if (event.expeditionId === expedition.id) {
        setError(event.error.message);
        setTimeout(() => setError(null), 5000);
      }
    },
    onConnectionChange: (connected: boolean) => {
      if (!connected) {
        setError('Connection lost - operations will be queued until reconnected');
      }
    }
  });

  // Combine socket error with local error
  const displayError = error || socketError;

  // Update local state when expedition prop changes
  useEffect(() => {
    setLocalExpedition(expedition);
  }, [expedition]);

  // Enhanced action handlers with offline support and better error handling
  const handleAction = useCallback(async (
    action: string,
    handler?: (expeditionId: string) => Promise<boolean>
  ) => {
    if (!handler) return;

    setActionLoading(action);
    setError(null);

    try {
      // Show different messages based on connection state
      if (!isConnected) {
        setError(`${action} queued - will execute when connection is restored`);
      }

      const success = await handler(localExpedition.id);
      if (!success) {
        // Provide more specific error messages based on connection state
        if (connectionState.circuitBreakerState === 'open') {
          setError(`Cannot ${action} expedition - connection temporarily suspended. Try again later.`);
        } else if (!isConnected) {
          setError(`${action} queued for when connection is restored`);
        } else {
          setError(`Failed to ${action} expedition`);
        }
      } else if (!isConnected) {
        // Success but offline - operation was queued
        setError(`${action} queued successfully - will execute when connected`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} expedition`;
      
      // Enhance error message with connection context
      if (!isConnected) {
        setError(`${errorMessage} - operation queued for retry`);
      } else if (connectionState.circuitBreakerState === 'open') {
        setError(`${errorMessage} - connection issues detected`);
      } else {
        setError(errorMessage);
      }
    } finally {
      setActionLoading(null);
    }
  }, [localExpedition.id, isConnected, connectionState.circuitBreakerState]);

  // Get status styling
  const getStatusConfig = (status: ExpeditionStatus) => {
    switch (status) {
      case 'draft':
        return {
          color: 'bg-gray-500',
          icon: FileText,
          label: 'Draft',
          variant: 'secondary' as const,
          pulse: false
        };
      case 'planning':
        return {
          color: 'bg-blue-500',
          icon: Target,
          label: 'Planning',
          variant: 'default' as const,
          pulse: true
        };
      case 'in-progress':
        return {
          color: 'bg-yellow-500',
          icon: Activity,
          label: 'In Progress',
          variant: 'default' as const,
          pulse: true
        };
      case 'review':
        return {
          color: 'bg-purple-500',
          icon: AlertCircle,
          label: 'Review',
          variant: 'secondary' as const,
          pulse: false
        };
      case 'completed':
        return {
          color: 'bg-green-500',
          icon: CheckCircle,
          label: 'Completed',
          variant: 'default' as const,
          pulse: false
        };
      case 'failed':
        return {
          color: 'bg-red-500',
          icon: XCircle,
          label: 'Failed',
          variant: 'destructive' as const,
          pulse: false
        };
      case 'cancelled':
        return {
          color: 'bg-gray-500',
          icon: XCircle,
          label: 'Cancelled',
          variant: 'secondary' as const,
          pulse: false
        };
      default:
        return {
          color: 'bg-gray-500',
          icon: FileText,
          label: status,
          variant: 'secondary' as const,
          pulse: false
        };
    }
  };

  // Get priority styling
  const getPriorityConfig = (priority: ExpeditionPriority) => {
    switch (priority) {
      case 'low':
        return { color: 'text-green-600', bg: 'bg-green-100', label: 'Low', icon: Shield };
      case 'medium':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Medium', icon: TrendingUp };
      case 'high':
        return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'High', icon: Zap };
      case 'urgent':
        return { color: 'text-red-600', bg: 'bg-red-100', label: 'Urgent', icon: AlertCircle };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', label: priority, icon: Shield };
    }
  };

  // Calculate enhanced progress
  const getProgress = () => {
    if (showTaskProgress && tasks.length > 0) {
      const completedTasks = tasks.filter(task => task.status === 'completed').length;
      return Math.round((completedTasks / tasks.length) * 100);
    }

    // Fallback to status-based progress
    switch (localExpedition.status) {
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

  // Get quality score display
  const getQualityDisplay = () => {
    if (!qualityScore || !showQualityScore) return null;

    const score = qualityScore.overall;
    let color = 'text-gray-500';
    let bgColor = 'bg-gray-100';

    if (score >= 90) {
      color = 'text-green-600';
      bgColor = 'bg-green-100';
    } else if (score >= 75) {
      color = 'text-blue-600';
      bgColor = 'bg-blue-100';
    } else if (score >= 60) {
      color = 'text-yellow-600';
      bgColor = 'bg-yellow-100';
    } else {
      color = 'text-red-600';
      bgColor = 'bg-red-100';
    }

    return { score, color, bgColor };
  };

  const statusConfig = getStatusConfig(localExpedition.status);
  const priorityConfig = getPriorityConfig(localExpedition.priority);
  const progress = getProgress();
  const qualityDisplay = getQualityDisplay();
  const StatusIcon = statusConfig.icon;
  const PriorityIcon = priorityConfig.icon;

  // Get assigned agents for display
  const assignedAgents = agents.filter(agent =>
    localExpedition.assignedAgents.includes(agent.id)
  );

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={className}
    >
      <Card
        className={`
          relative cursor-pointer transition-all duration-200 group
          hover:shadow-lg hover:border-primary/50
          ${error ? 'border-red-200 bg-red-50/50' : ''}
          ${isConnected && enableRealTimeUpdates ? 'ring-1 ring-green-200' : ''}
        `}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`Expedition: ${localExpedition.title}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {/* Enhanced connection status indicator */}
        {enableRealTimeUpdates && (
          <div className="absolute top-2 right-2">
            <ConnectionStatus
              connectionState={connectionState}
              onForceReconnect={forceReconnect}
              onResetCircuitBreaker={resetCircuitBreaker}
              onClearQueue={clearOfflineQueue}
              getHealthStatus={getHealthStatus}
              getOfflineQueueStatus={getOfflineQueueStatus}
              getCircuitBreakerStatus={getCircuitBreakerStatus}
              compact={true}
            />
          </div>
        )}

        {/* Enhanced error banner */}
        <AnimatePresence>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`border-b px-4 py-2 ${
                !isConnected || connectionState.circuitBreakerState === 'open'
                  ? 'bg-yellow-100 border-yellow-200'
                  : 'bg-red-100 border-red-200'
              }`}
            >
              <div className={`flex items-center space-x-2 text-sm ${
                !isConnected || connectionState.circuitBreakerState === 'open'
                  ? 'text-yellow-700'
                  : 'text-red-700'
              }`}>
                <AlertCircle className="h-4 w-4" />
                <span>{displayError}</span>
                {!isConnected && (
                  <Badge variant="outline" className="text-xs ml-2">
                    Offline Mode
                  </Badge>
                )}
                {connectionState.circuitBreakerState === 'open' && (
                  <Badge variant="outline" className="text-xs ml-2">
                    Connection Suspended
                  </Badge>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <CardTitle className="text-lg font-semibold truncate">
                  {localExpedition.title}
                </CardTitle>
                {qualityDisplay && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge
                          variant="outline"
                          className={`${qualityDisplay.color} ${qualityDisplay.bgColor} border-current text-xs`}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          {qualityDisplay.score}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p>Quality Score: {qualityDisplay.score}/100</p>
                          <p>Completeness: {qualityScore?.completeness || 0}/100</p>
                          <p>Accuracy: {qualityScore?.accuracy || 0}/100</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <CardDescription className="mt-1 line-clamp-2">
                {localExpedition.description}
              </CardDescription>
            </div>

            <div className="flex items-start space-x-2 ml-4">
              <div className="flex flex-col items-end space-y-2">
                <Badge
                  variant={statusConfig.variant}
                  className={`flex items-center space-x-1 ${statusConfig.pulse ? 'animate-pulse' : ''}`}
                >
                  <StatusIcon className="h-3 w-3" />
                  <span>{statusConfig.label}</span>
                </Badge>
                <Badge
                  variant="outline"
                  className={`${priorityConfig.color} ${priorityConfig.bg} border-current flex items-center space-x-1`}
                >
                  <PriorityIcon className="h-3 w-3" />
                  <span>{priorityConfig.label}</span>
                </Badge>
              </div>

              {/* Context Menu */}
              {enableContextMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onViewDetails && (
                      <DropdownMenuItem onClick={() => onViewDetails(localExpedition.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                    )}
                    {onViewChat && (
                      <DropdownMenuItem onClick={() => onViewChat(localExpedition.id)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Open Chat
                      </DropdownMenuItem>
                    )}
                    {onViewAnalytics && (
                      <DropdownMenuItem onClick={() => onViewAnalytics(localExpedition.id)}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(localExpedition.id)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem onClick={() => onDuplicate(localExpedition.id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => onDelete(localExpedition.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Objective */}
          <div className="flex items-start space-x-2">
            <Target className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground line-clamp-2">
              {localExpedition.objective}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <div className="flex items-center space-x-2">
                {showTaskProgress && tasks.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {tasks.filter(t => t.status === 'completed').length}/{tasks.length} tasks
                  </span>
                )}
                <span className="font-medium">{progress}%</span>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Agent Avatars */}
          {showAgentAvatars && assignedAgents.length > 0 && (
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="flex -space-x-2">
                {assignedAgents.slice(0, 3).map((agent) => (
                  <TooltipProvider key={agent.id}>
                    <Tooltip>
                      <TooltipTrigger>
                        <Avatar className="h-6 w-6 border-2 border-background">
                          <AvatarImage src={agent.avatar} alt={agent.name} />
                          <AvatarFallback className="text-xs">
                            {agent.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-muted-foreground">{agent.category}</p>
                          <p className={`text-xs ${agent.status === 'available' ? 'text-green-600' :
                              agent.status === 'busy' ? 'text-yellow-600' : 'text-gray-600'
                            }`}>
                            {agent.status}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {assignedAgents.length > 3 && (
                  <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                    <span className="text-xs font-medium">+{assignedAgents.length - 3}</span>
                  </div>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {assignedAgents.length} agent{assignedAgents.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {localExpedition.estimatedDuration ? `${localExpedition.estimatedDuration}m` : 'No estimate'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(localExpedition.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Tags */}
          {localExpedition.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {localExpedition.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {localExpedition.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{localExpedition.tags.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* Enhanced Action Buttons with offline support */}
          <AnimatePresence>
            {showActions && (isHovered || ['in-progress', 'planning'].includes(localExpedition.status)) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-between pt-2 border-t"
              >
                <div className="flex space-x-2">
                  {localExpedition.status === 'draft' && onStart && (
                    <div className="relative">
                      <ActionButton
                        icon={Play}
                        label={!isConnected ? "Start Expedition (will queue)" : "Start Expedition"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('start', onStart);
                        }}
                        loading={actionLoading === 'start'}
                        variant="default"
                        disabled={connectionState.circuitBreakerState === 'open'}
                      />
                      {!isConnected && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
                      )}
                    </div>
                  )}

                  {localExpedition.status === 'in-progress' && onPause && (
                    <div className="relative">
                      <ActionButton
                        icon={Pause}
                        label={!isConnected ? "Pause Expedition (will queue)" : "Pause Expedition"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('pause', onPause);
                        }}
                        loading={actionLoading === 'pause'}
                        disabled={connectionState.circuitBreakerState === 'open'}
                      />
                      {!isConnected && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
                      )}
                    </div>
                  )}

                  {['paused', 'failed'].includes(localExpedition.status) && onResume && (
                    <div className="relative">
                      <ActionButton
                        icon={RotateCcw}
                        label={!isConnected ? "Resume Expedition (will queue)" : "Resume Expedition"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('resume', onResume);
                        }}
                        loading={actionLoading === 'resume'}
                        variant="default"
                        disabled={connectionState.circuitBreakerState === 'open'}
                      />
                      {!isConnected && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
                      )}
                    </div>
                  )}

                  {['draft', 'planning', 'in-progress'].includes(localExpedition.status) && onCancel && (
                    <div className="relative">
                      <ActionButton
                        icon={XCircle}
                        label={!isConnected ? "Cancel Expedition (will queue)" : "Cancel Expedition"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction('cancel', onCancel);
                        }}
                        loading={actionLoading === 'cancel'}
                        variant="destructive"
                        disabled={connectionState.circuitBreakerState === 'open'}
                      />
                      {!isConnected && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
                      )}
                    </div>
                  )}
                </div>

                {/* Quick access buttons */}
                <div className="flex space-x-1">
                  {onViewChat && (
                    <ActionButton
                      icon={MessageSquare}
                      label="Open Chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewChat(localExpedition.id);
                      }}
                    />
                  )}
                  {onViewAnalytics && (
                    <ActionButton
                      icon={BarChart3}
                      label="View Analytics"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewAnalytics(localExpedition.id);
                      }}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}