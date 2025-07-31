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
  RotateCcw,
  Sparkles,
  Rocket
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
// Socket import removed - using HTTP-only implementation
// ConnectionStatus removed - not needed in HTTP mode
import type {
  Expedition,
  ExpeditionTask,
  ExpeditionStatus,
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

  // HTTP-only implementation: Real-time updates disabled
  // Socket integration removed to use HTTP API only
  const displayError = error; // Only local errors in HTTP mode

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
      const success = await handler(localExpedition.id);
      if (!success) {
        setError(`Failed to ${action} expedition`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} expedition`;
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  }, [localExpedition.id]);

  // Get status styling
  const getStatusConfig = (status: ExpeditionStatus) => {
    switch (status) {
      case 'draft':
        return {
          icon: FileText,
          label: 'Draft',
          className: 'text-slate-600 bg-slate-50 dark:bg-slate-900/50 dark:text-slate-400',
          dotColor: 'bg-slate-400',
          pulse: false
        };
      case 'planning':
        return {
          icon: Target,
          label: 'Planning',
          className: 'text-blue-600 bg-blue-50 dark:bg-blue-900/50 dark:text-blue-400',
          dotColor: 'bg-blue-500',
          pulse: true
        };
      case 'in-progress':
        return {
          icon: Activity,
          label: 'In Progress',
          className: 'text-amber-600 bg-amber-50 dark:bg-amber-900/50 dark:text-amber-400',
          dotColor: 'bg-amber-500',
          pulse: true
        };
      case 'review':
        return {
          icon: AlertCircle,
          label: 'Review',
          className: 'text-purple-600 bg-purple-50 dark:bg-purple-900/50 dark:text-purple-400',
          dotColor: 'bg-purple-500',
          pulse: false
        };
      case 'completed':
        return {
          icon: CheckCircle,
          label: 'Completed',
          className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/50 dark:text-emerald-400',
          dotColor: 'bg-emerald-500',
          pulse: false
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Failed',
          className: 'text-red-600 bg-red-50 dark:bg-red-900/50 dark:text-red-400',
          dotColor: 'bg-red-500',
          pulse: false
        };
      case 'cancelled':
        return {
          icon: XCircle,
          label: 'Cancelled',
          className: 'text-gray-600 bg-gray-50 dark:bg-gray-900/50 dark:text-gray-400',
          dotColor: 'bg-gray-400',
          pulse: false
        };
      default:
        return {
          icon: FileText,
          label: status,
          className: 'text-gray-600 bg-gray-50 dark:bg-gray-900/50 dark:text-gray-400',
          dotColor: 'bg-gray-400',
          pulse: false
        };
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

  // Derive expedition type from mission
  const getExpeditionType = () => {
    const mission = localExpedition.mission.toLowerCase();
    if (mission.includes('research') || mission.includes('analyze') || mission.includes('study')) {
      return { label: 'Research', icon: Sparkles, className: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400' };
    }
    if (mission.includes('develop') || mission.includes('build') || mission.includes('create')) {
      return { label: 'Development', icon: Zap, className: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400' };
    }
    if (mission.includes('explore') || mission.includes('discover') || mission.includes('investigate')) {
      return { label: 'Exploration', icon: Target, className: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400' };
    }
    if (mission.includes('fix') || mission.includes('repair') || mission.includes('debug')) {
      return { label: 'Maintenance', icon: Shield, className: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400' };
    }
    if (mission.includes('deploy') || mission.includes('release') || mission.includes('launch')) {
      return { label: 'Deployment', icon: Activity, className: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' };
    }
    return { label: 'Mission', icon: Rocket, className: 'text-gray-600 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400' };
  };

  const statusConfig = getStatusConfig(localExpedition.status);
  const progress = getProgress();
  const qualityDisplay = getQualityDisplay();
  const expeditionType = getExpeditionType();
  const StatusIcon = statusConfig.icon;
  const TypeIcon = expeditionType.icon;

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
          relative cursor-pointer transition-all duration-300 group
          bg-gradient-to-br from-background via-background to-muted/5
          hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40
          hover:bg-gradient-to-br hover:from-background hover:via-background hover:to-primary/5
          border-muted-foreground/10
          ${error ? 'border-red-200 bg-red-50/50' : ''}
        `}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`Expedition: ${localExpedition.name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {/* Connection status removed - HTTP mode only */}

        {/* Enhanced error banner */}
        <AnimatePresence>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b px-4 py-2 bg-red-100 border-red-200"
            >
              <div className="flex items-center space-x-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>{displayError}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <CardTitle className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                  {localExpedition.name}
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
              <CardDescription className="mt-1 line-clamp-2 text-sm">
                {localExpedition.mission}
              </CardDescription>
            </div>

            <div className="flex items-start space-x-2 ml-4">
              <div className="flex flex-col items-end space-y-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${statusConfig.className}`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                  <span>{statusConfig.label}</span>
                </div>
                <div
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${expeditionType.className}`}
                >
                  <TypeIcon className="h-3 w-3" />
                  <span>{expeditionType.label}</span>
                </div>
              </div>

              {/* Context Menu */}
              {enableContextMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-4 w-4 text-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-background border shadow-lg">
                    {onViewChat && (
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewChat(localExpedition.id);
                        }}
                        className="cursor-pointer"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Open Chat
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        {onViewChat && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(localExpedition.id);
                          }}
                          className="text-red-600 focus:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Progress</span>
              <div className="flex items-center space-x-2">
                {showTaskProgress && tasks.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    {tasks.filter(t => t.status === 'completed').length}/{tasks.length} tasks
                  </span>
                )}
                <span className="font-bold text-primary">{progress}%</span>
              </div>
            </div>
            <div className="relative">
              <Progress value={progress} className="h-2 bg-muted/30" />
              {progress > 0 && progress < 100 && statusConfig.pulse && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </div>
          </div>

          {/* Agent Avatars */}
          {showAgentAvatars && assignedAgents.length > 0 && (
            <div className="flex items-center justify-between bg-muted/10 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Crew</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex -space-x-2">
                  {assignedAgents.slice(0, 3).map((agent) => (
                    <TooltipProvider key={agent.id}>
                      <Tooltip>
                        <TooltipTrigger>
                          <Avatar className="h-7 w-7 border-2 border-background shadow-sm hover:scale-110 transition-transform">
                            <AvatarImage src={agent.avatar} alt={agent.name} />
                            <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-primary/30">
                              {agent.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p className="font-semibold">{agent.name}</p>
                            <p className="text-muted-foreground">{agent.category}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <div className={`h-2 w-2 rounded-full ${agent.status === 'available' ? 'bg-green-500' :
                                  agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'
                                }`} />
                              <p className="capitalize">{agent.status}</p>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                  {assignedAgents.length > 3 && (
                    <div className="h-7 w-7 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center shadow-sm">
                      <span className="text-xs font-semibold">+{assignedAgents.length - 3}</span>
                    </div>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {assignedAgents.length} agent{assignedAgents.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {formatDistanceToNow(new Date(localExpedition.createdAt), { addSuffix: true })}
              </span>
            </div>
            {localExpedition.updatedAt !== localExpedition.createdAt && (
              <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                <Clock className="h-3 w-3 mr-1" />
                Updated
              </Badge>
            )}
          </div>


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
                    <ActionButton
                      icon={Play}
                      label="Start Expedition"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('start', onStart);
                      }}
                      loading={actionLoading === 'start'}
                      variant="default"
                    />
                  )}

                  {localExpedition.status === 'in-progress' && onPause && (
                    <ActionButton
                      icon={Pause}
                      label="Pause Expedition"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('pause', onPause);
                      }}
                      loading={actionLoading === 'pause'}
                    />
                  )}

                  {['paused', 'failed'].includes(localExpedition.status) && onResume && (
                    <ActionButton
                      icon={RotateCcw}
                      label="Resume Expedition"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('resume', onResume);
                      }}
                      loading={actionLoading === 'resume'}
                      variant="default"
                    />
                  )}

                  {['draft', 'planning', 'in-progress'].includes(localExpedition.status) && onCancel && (
                    <ActionButton
                      icon={XCircle}
                      label="Cancel Expedition"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('cancel', onCancel);
                      }}
                      loading={actionLoading === 'cancel'}
                      variant="destructive"
                    />
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}