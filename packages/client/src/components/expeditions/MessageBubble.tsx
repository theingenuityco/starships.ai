'use client';

import { useState, useRef, useEffect } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  User,
  Bot,
  Crown,
  Settings,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  MessageSquare,
  Reply,
  MoreHorizontal,
  Copy,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smile,
  Check,
  CheckCheck,
  Eye,
  Paperclip,
  Image,
  FileText,
  Download,
  ExternalLink,
  Zap
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

// Enhanced type definitions
interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  preview?: string;
}

interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface MessageStatus {
  sent: boolean;
  delivered: boolean;
  read: boolean;
  readBy?: string[];
  deliveredAt?: string;
  readAt?: string;
}

interface ExpeditionMessage {
  id: string;
  expeditionId: string;
  role: 'user' | 'first-officer' | 'agent' | 'system';
  agentId?: string;
  userId?: string;
  content: string;
  messageType: 'coordination' | 'task-work' | 'user-input' | 'status-update' | 'result' | 'question' | 'notification';
  timestamp: string;
  threadId?: string;
  parentMessageId?: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  status?: MessageStatus;
  metadata?: Record<string, any>;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

interface MessageBubbleProps {
  message: ExpeditionMessage;
  showAvatar?: boolean;
  compact?: boolean;
  showReactions?: boolean;
  showStatus?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  onReply?: (message: ExpeditionMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  className?: string;
}

export function MessageBubble({
  message,
  showAvatar = true,
  compact = false,
  showReactions = true,
  showStatus = true,
  showTimestamp = true,
  enableActions = true,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onCopy,
  className
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showFullTimestamp, setShowFullTimestamp] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  
  // Enhanced role configuration with more styling options
  const getRoleConfig = (role: ExpeditionMessage['role']) => {
    switch (role) {
      case 'user':
        return {
          icon: User,
          label: 'You',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          align: 'right' as const,
          avatarBg: 'bg-blue-100 dark:bg-blue-900',
          priority: 'high' as const
        };
      case 'first-officer':
        return {
          icon: Crown,
          label: 'First Officer',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50 dark:bg-purple-950/20',
          borderColor: 'border-purple-200 dark:border-purple-800',
          align: 'left' as const,
          avatarBg: 'bg-purple-100 dark:bg-purple-900',
          priority: 'critical' as const
        };
      case 'agent':
        return {
          icon: Bot,
          label: message.agentId ? `Agent ${message.agentId.slice(0, 8)}` : 'Agent',
          color: 'text-green-600',
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          borderColor: 'border-green-200 dark:border-green-800',
          align: 'left' as const,
          avatarBg: 'bg-green-100 dark:bg-green-900',
          priority: 'medium' as const
        };
      case 'system':
        return {
          icon: Settings,
          label: 'System',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          align: 'center' as const,
          avatarBg: 'bg-gray-100 dark:bg-gray-900',
          priority: 'low' as const
        };
      default:
        return {
          icon: MessageSquare,
          label: role,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          align: 'left' as const,
          avatarBg: 'bg-gray-100 dark:bg-gray-900',
          priority: 'low' as const
        };
    }
  };

  // Enhanced message type configuration
  const getMessageTypeConfig = (messageType: ExpeditionMessage['messageType']) => {
    switch (messageType) {
      case 'coordination':
        return {
          icon: Crown,
          color: 'text-purple-500',
          label: 'Coordination',
          bgColor: 'bg-purple-100 dark:bg-purple-900/20',
          description: 'First Officer coordination message'
        };
      case 'task-work':
        return {
          icon: Zap,
          color: 'text-green-500',
          label: 'Task Work',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          description: 'Agent task execution'
        };
      case 'user-input':
        return {
          icon: User,
          color: 'text-blue-500',
          label: 'User Input',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          description: 'User message'
        };
      case 'status-update':
        return {
          icon: Info,
          color: 'text-blue-500',
          label: 'Status Update',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          description: 'System status update'
        };
      case 'result':
        return {
          icon: CheckCircle,
          color: 'text-green-500',
          label: 'Result',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          description: 'Task result or output'
        };
      case 'question':
        return {
          icon: AlertCircle,
          color: 'text-yellow-500',
          label: 'Question',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          description: 'Question requiring response'
        };
      case 'notification':
        return {
          icon: Info,
          color: 'text-gray-500',
          label: 'Notification',
          bgColor: 'bg-gray-100 dark:bg-gray-900/20',
          description: 'System notification'
        };
      default:
        return {
          icon: MessageSquare,
          color: 'text-gray-500',
          label: messageType,
          bgColor: 'bg-gray-100 dark:bg-gray-900/20',
          description: 'Unknown message type'
        };
    }
  };

  // Utility functions
  const getStatusIcon = (status?: MessageStatus) => {
    if (!status) return null;
    
    if (status.read) return <CheckCheck className="h-3 w-3 text-blue-500" />;
    if (status.delivered) return <Check className="h-3 w-3 text-gray-500" />;
    if (status.sent) return <Clock className="h-3 w-3 text-gray-400" />;
    return null;
  };

  const formatTimestamp = (timestamp: string, full: boolean = false) => {
    const date = new Date(timestamp);
    if (full) {
      return format(date, 'PPpp'); // Full date and time
    }
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const handleCopyMessage = () => {
    if (onCopy) {
      onCopy(message.content);
    } else {
      navigator.clipboard.writeText(message.content);
    }
  };

  const handleReaction = (emoji: string) => {
    if (onReact) {
      onReact(message.id, emoji);
    }
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    const isImage = attachment.type.startsWith('image/');
    const isDocument = attachment.type.includes('document') || attachment.type.includes('pdf');
    
    return (
      <div key={attachment.id} className="flex items-center space-x-2 p-2 bg-muted rounded-md">
        {isImage ? (
          <Image className="h-4 w-4 text-blue-500" />
        ) : isDocument ? (
          <FileText className="h-4 w-4 text-red-500" />
        ) : (
          <Paperclip className="h-4 w-4 text-gray-500" />
        )}
        <span className="text-sm truncate flex-1">{attachment.name}</span>
        {attachment.size && (
          <span className="text-xs text-muted-foreground">
            {(attachment.size / 1024).toFixed(1)}KB
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Download className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const roleConfig = getRoleConfig(message.role);
  const messageTypeConfig = getMessageTypeConfig(message.messageType);
  const RoleIcon = roleConfig.icon;
  const MessageTypeIcon = messageTypeConfig.icon;

  // Check if message is sending (optimistic update)
  const isSending = message.metadata?.sending;
  const isDeleted = message.isDeleted;
  const isEdited = message.isEdited;

  // System messages have special styling
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center space-x-2 px-3 py-2 bg-muted rounded-full text-sm text-muted-foreground">
          <RoleIcon className="h-4 w-4" />
          <span>{isDeleted ? 'Message deleted' : message.content}</span>
          {showTimestamp && (
            <span className="text-xs">
              {formatTimestamp(message.timestamp)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        ref={messageRef}
        className={cn(
          `group flex mb-4 transition-all duration-200`,
          roleConfig.align === 'right' ? 'justify-end' : 'justify-start',
          className
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className={cn(
          `flex items-start space-x-3 max-w-[80%] relative`,
          roleConfig.align === 'right' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
        )}>
          {/* Avatar */}
          {showAvatar && !compact && (
            <div className={`flex-shrink-0 ${roleConfig.align === 'right' ? 'ml-3' : 'mr-3'}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className={cn(
                    `h-8 w-8 border transition-all duration-200`,
                    roleConfig.avatarBg,
                    roleConfig.borderColor,
                    'hover:scale-105'
                  )}>
                    <RoleIcon className={`h-4 w-4 ${roleConfig.color}`} />
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{roleConfig.label}</p>
                  {message.agentId && <p className="text-xs">ID: {message.agentId}</p>}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Message Content */}
          <div className={cn(
            `flex flex-col relative`,
            roleConfig.align === 'right' ? 'items-end' : 'items-start'
          )}>
            {/* Header */}
            {!compact && (
              <div className={cn(
                `flex items-center space-x-2 mb-1`,
                roleConfig.align === 'right' ? 'flex-row-reverse space-x-reverse' : ''
              )}>
                <span className={`text-sm font-medium ${roleConfig.color}`}>
                  {roleConfig.label}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs hover:bg-muted">
                      <MessageTypeIcon className="h-3 w-3 mr-1" />
                      {messageTypeConfig.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{messageTypeConfig.description}</p>
                  </TooltipContent>
                </Tooltip>
                {showTimestamp && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowFullTimestamp(!showFullTimestamp)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {formatTimestamp(message.timestamp, showFullTimestamp)}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to toggle full timestamp</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* Message Bubble */}
            <Card className={cn(
              `transition-all duration-200 hover:shadow-md`,
              roleConfig.bgColor,
              roleConfig.borderColor,
              'border',
              isSending && 'opacity-70 animate-pulse',
              isDeleted && 'opacity-50'
            )}>
              <CardContent className="p-3">
                {/* Message Content */}
                <div className="text-sm whitespace-pre-wrap break-words">
                  {isDeleted ? (
                    <span className="italic text-muted-foreground">Message deleted</span>
                  ) : (
                    message.content
                  )}
                  {isEdited && !isDeleted && (
                    <span className="text-xs text-muted-foreground ml-2">(edited)</span>
                  )}
                </div>

                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && !isDeleted && (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map(renderAttachment)}
                  </div>
                )}
                
                {/* Sending indicator */}
                {isSending && (
                  <div className="flex items-center space-x-1 mt-2 text-xs text-muted-foreground">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                    <span>Sending...</span>
                  </div>
                )}

                {/* Message Status */}
                {showStatus && message.status && roleConfig.align === 'right' && (
                  <div className="flex items-center justify-end mt-2 space-x-1">
                    {getStatusIcon(message.status)}
                    {message.status.readBy && message.status.readBy.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center space-x-1">
                            <Eye className="h-3 w-3 text-blue-500" />
                            <span className="text-xs text-muted-foreground">
                              {message.status.readBy.length}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Read by {message.status.readBy.length} participant(s)</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}

                {/* Compact timestamp */}
                {compact && showTimestamp && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatTimestamp(message.timestamp)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reactions */}
            {showReactions && message.reactions && message.reactions.length > 0 && (
              <div className="flex items-center space-x-1 mt-1">
                {message.reactions.map((reaction, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleReaction(reaction.emoji)}
                        className={cn(
                          "flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition-colors",
                          reaction.hasReacted
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <span>{reaction.emoji}</span>
                        <span>{reaction.count}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{reaction.users.join(', ')} reacted with {reaction.emoji}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Thread indicator */}
            {message.threadId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center space-x-1 hover:text-foreground transition-colors cursor-pointer">
                    <MessageSquare className="h-3 w-3" />
                    <span>Thread: {message.threadId.slice(0, 8)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Part of message thread</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Action Buttons */}
            {enableActions && showActions && !isDeleted && (
              <div className={cn(
                "absolute top-0 flex items-center space-x-1 bg-background border rounded-md shadow-md p-1 transition-all duration-200",
                roleConfig.align === 'right' ? '-left-20' : '-right-20',
                "opacity-0 group-hover:opacity-100"
              )}>
                {onReply && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onReply(message)}
                      >
                        <Reply className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reply</TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleCopyMessage}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy message</TooltipContent>
                </Tooltip>

                {showReactions && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleReaction('👍')}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>React</TooltipContent>
                  </Tooltip>
                )}

                {(onEdit || onDelete) && roleConfig.align === 'right' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>More actions</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}