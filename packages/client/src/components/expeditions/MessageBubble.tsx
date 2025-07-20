'use client';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  User, 
  Bot, 
  Crown, 
  Settings, 
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  MessageSquare
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Local type definitions
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
  metadata?: Record<string, any>;
}

interface MessageBubbleProps {
  message: ExpeditionMessage;
  showAvatar?: boolean;
  compact?: boolean;
}

export function MessageBubble({ 
  message, 
  showAvatar = true, 
  compact = false 
}: MessageBubbleProps) {
  
  // Get role configuration
  const getRoleConfig = (role: ExpeditionMessage['role']) => {
    switch (role) {
      case 'user':
        return {
          icon: User,
          label: 'You',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          align: 'right' as const
        };
      case 'first-officer':
        return {
          icon: Crown,
          label: 'First Officer',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200',
          align: 'left' as const
        };
      case 'agent':
        return {
          icon: Bot,
          label: message.agentId ? `Agent ${message.agentId.slice(0, 8)}` : 'Agent',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          align: 'left' as const
        };
      case 'system':
        return {
          icon: Settings,
          label: 'System',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          align: 'center' as const
        };
      default:
        return {
          icon: MessageSquare,
          label: role,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          align: 'left' as const
        };
    }
  };

  // Get message type configuration
  const getMessageTypeConfig = (messageType: ExpeditionMessage['messageType']) => {
    switch (messageType) {
      case 'coordination':
        return { icon: Crown, color: 'text-purple-500', label: 'Coordination' };
      case 'task-work':
        return { icon: Bot, color: 'text-green-500', label: 'Task Work' };
      case 'user-input':
        return { icon: User, color: 'text-blue-500', label: 'User Input' };
      case 'status-update':
        return { icon: Info, color: 'text-blue-500', label: 'Status Update' };
      case 'result':
        return { icon: CheckCircle, color: 'text-green-500', label: 'Result' };
      case 'question':
        return { icon: AlertCircle, color: 'text-yellow-500', label: 'Question' };
      case 'notification':
        return { icon: Info, color: 'text-gray-500', label: 'Notification' };
      default:
        return { icon: MessageSquare, color: 'text-gray-500', label: messageType };
    }
  };

  const roleConfig = getRoleConfig(message.role);
  const messageTypeConfig = getMessageTypeConfig(message.messageType);
  const RoleIcon = roleConfig.icon;
  const MessageTypeIcon = messageTypeConfig.icon;

  // Check if message is sending (optimistic update)
  const isSending = message.metadata?.sending;

  // System messages have special styling
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center space-x-2 px-3 py-2 bg-muted rounded-full text-sm text-muted-foreground">
          <RoleIcon className="h-4 w-4" />
          <span>{message.content}</span>
          <span className="text-xs">
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${roleConfig.align === 'right' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex ${roleConfig.align === 'right' ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3 max-w-[80%]`}>
        {/* Avatar */}
        {showAvatar && !compact && (
          <div className={`flex-shrink-0 ${roleConfig.align === 'right' ? 'ml-3' : 'mr-3'}`}>
            <Avatar className={`h-8 w-8 ${roleConfig.bgColor} ${roleConfig.borderColor} border`}>
              <RoleIcon className={`h-4 w-4 ${roleConfig.color}`} />
            </Avatar>
          </div>
        )}

        {/* Message Content */}
        <div className={`flex flex-col ${roleConfig.align === 'right' ? 'items-end' : 'items-start'}`}>
          {/* Header */}
          {!compact && (
            <div className={`flex items-center space-x-2 mb-1 ${roleConfig.align === 'right' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <span className={`text-sm font-medium ${roleConfig.color}`}>
                {roleConfig.label}
              </span>
              <Badge variant="outline" className="text-xs">
                <MessageTypeIcon className="h-3 w-3 mr-1" />
                {messageTypeConfig.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
              </span>
            </div>
          )}

          {/* Message Bubble */}
          <Card className={`${roleConfig.bgColor} ${roleConfig.borderColor} border ${isSending ? 'opacity-70' : ''}`}>
            <CardContent className="p-3">
              <div className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </div>
              
              {/* Sending indicator */}
              {isSending && (
                <div className="flex items-center space-x-1 mt-2 text-xs text-muted-foreground">
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                  <span>Sending...</span>
                </div>
              )}

              {/* Compact timestamp */}
              {compact && (
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Thread indicator */}
          {message.threadId && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center space-x-1">
              <MessageSquare className="h-3 w-3" />
              <span>Thread: {message.threadId.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}