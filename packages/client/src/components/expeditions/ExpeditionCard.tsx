'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  FileText,
  MoreVertical,
  Activity,
  Zap,
  Trash2,
  MessageSquare,
  Shield,
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

// Main ExpeditionCard Component
export function ExpeditionCard({
  expedition,
  onClick,
  enableContextMenu = true,
  showAgentAvatars = true,
  showQualityScore = true,
  showTaskProgress = true,
  onDelete,
  onViewChat,
  agents = [],
  tasks = [],
  qualityScore,
  className = ''
}: ExpeditionCardProps) {

  // State management
  const [isHovered, setIsHovered] = useState(false);
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
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={className}
    >
      <Card
        className={`
          cursor-pointer transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/40 overflow-hidden
          h-[240px] flex flex-col
          ${isHovered ? 'shadow-lg border-border/60 bg-card/60' : ''}
          hover:shadow-xl hover:shadow-primary/3
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
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-secondary/3 pointer-events-none" />
        
        {/* Connection status removed - HTTP mode only */}

        {/* Enhanced error banner */}
        {displayError && (
          <div
            className="border-b px-4 py-2 bg-red-100 border-red-200"
          >
            <div className="flex items-center space-x-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{displayError}</span>
            </div>
          </div>
        )}

        <CardHeader className="pb-0 relative space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar className="w-14 h-14">
                <AvatarFallback className="text-3xl bg-muted border border-border/30">
                  <TypeIcon className="h-8 w-8 text-primary" />
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg font-bold">{localExpedition.name}</CardTitle>
                <Badge 
                  variant="outline"
                  className={`mt-1 text-[10px] px-1.5 py-0.5 h-5 ${
                    statusConfig.pulse 
                      ? 'bg-amber-50 text-amber-700 border-amber-200' 
                      : localExpedition.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : localExpedition.status === 'failed'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {statusConfig.label}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-2">

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
          
          {/* Description with ellipsis */}
          <div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {localExpedition.mission}
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-3 relative flex-1 flex flex-col justify-between">
          {/* Agent Deployment */}
          <div className="flex items-center">
            <div className="relative flex items-center">
              {/* Stacked avatars */}
              {assignedAgents.slice(0, 3).map((agent, i) => (
                <Avatar
                  key={agent.id}
                  className={`w-7 h-7 border-2 border-background shadow-sm transition-all duration-200 absolute ${
                    i === 0 ? "[&>span]:bg-blue-500" :
                    i === 1 ? "[&>span]:bg-purple-500" : 
                    "[&>span]:bg-green-500"
                  }`}
                  style={{
                    transform: `translateX(${i * -8}px)`,
                    zIndex: 3 - i,
                  }}
                >
                  <AvatarImage src={agent.avatar} />
                  <AvatarFallback className="text-xs font-medium text-white">
                    {agent.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              
              {/* "+X more" indicator */}
              {assignedAgents.length > 3 && (
                <Avatar
                  className="w-7 h-7 border-2 border-background shadow-sm"
                  style={{
                    transform: `translateX(${3 * -8}px)`,
                    zIndex: 0,
                  }}
                >
                  <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                    +{assignedAgents.length - 3}
                  </AvatarFallback>
                </Avatar>
              )}
              
              {/* Empty state */}
              {assignedAgents.length === 0 && (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <Avatar className="w-7 h-7 border-2 border-dashed border-muted-foreground/30">
                    <AvatarFallback className="bg-transparent">
                      <Users className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">No agents assigned</span>
                </div>
              )}
              
              {/* Spacing for overlapped avatars */}
              <div style={{ width: `${Math.max(0, Math.min(3, assignedAgents.length) * 8 + (assignedAgents.length > 3 ? 8 : 0))}px` }} />
            </div>
          </div>

          {/* Status Notification */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center space-x-2 text-xs">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(localExpedition.createdAt), { addSuffix: true })}
              </span>
            </div>
            <Badge 
              variant="outline" 
              className={`text-xs px-2 py-0.5 capitalize ${expeditionType.className}`}
            >
              {expeditionType.label}
            </Badge>
          </div>


        </CardContent>
      </Card>
    </motion.div>
  );
}