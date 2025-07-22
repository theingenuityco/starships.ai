'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Users,
  Clock,
  Target,
  MessageSquare,
  Settings,
  BarChart3,
  FileText,
  AlertCircle,
  Search,
  Download,
  RefreshCw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX
} from 'lucide-react';
import Link from 'next/link';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { MessageSearch } from './MessageSearch';
import { ExpeditionProgress } from './ExpeditionProgress';
import { TaskTimeline } from './TaskTimeline';
import { ParticipantsList } from './ParticipantsList';
import { useExpeditionData } from '@/hooks/useExpeditionData';
import { useExpeditionChat } from '@/hooks/useExpeditionChat';
import { useEnhancedExpeditionSocket } from '@/hooks/useEnhancedExpeditionSocket';
import { expeditionAPI } from '@/lib/expeditionApi';
import { agentAPI } from '@/lib/api';

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

interface ExpeditionChatProps {
  starshipSlug: string;
  expeditionId: string;
}

export function ExpeditionChat({ starshipSlug, expeditionId }: ExpeditionChatProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'progress' | 'tasks' | 'participants'>('chat');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  
  // Enhanced state for new features
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [messageThreads, setMessageThreads] = useState<Record<string, any[]>>({});
  const [retryAttempts, setRetryAttempts] = useState<Record<string, number>>({});
  
  // Refs for accessibility and performance
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get starship ID from the slug first
  const [starshipId, setStarshipId] = useState<string>('');
  const [agentDetails, setAgentDetails] = useState<Record<string, any>>({});

  // Fetch starship by slug to get the real ID
  useEffect(() => {
    const fetchStarshipBySlug = async () => {
      try {
        const { default: api } = await import('@/lib/api');
        const response = await api.get(`/api/starships/${starshipSlug}`);
        const starship = response.data.starship;
        
        if (starship?.id) {
          setStarshipId(starship.id);
        }
      } catch (error) {
        console.error(`Failed to fetch starship by slug: ${starshipSlug}`, error);
      }
    };

    if (starshipSlug) {
      fetchStarshipBySlug();
    }
  }, [starshipSlug]);


  // Data hooks
  const {
    expedition,
    expeditionLoading,
    expeditionError,
    tasks,
    refreshExpedition
  } = useExpeditionData({
    starshipId,
    expeditionId,
    autoRefresh: true
  });

  // Chat hook
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sending,
    sendMessage,
    messagesEndRef
  } = useExpeditionChat({
    expeditionId,
    starshipId,
    autoScroll: true
  });

  // Enhanced socket integration
  const {
    startExpedition,
    pauseExpedition,
    cancelExpedition,
    error: socketError,
    realtimeData,
    startTyping,
    stopTyping
  } = useEnhancedExpeditionSocket({
    expeditionId,
    enableTypingIndicators: true,
    debugMode: false,
    onExpeditionStarted: () => {
      refreshExpedition();
    },
    onExpeditionCompleted: () => {
      refreshExpedition();
    },
    onExpeditionPaused: () => {
      refreshExpedition();
    },
    onExpeditionCancelled: () => {
      refreshExpedition();
    },
    onStatusUpdate: () => {
      refreshExpedition();
    },
    onTypingStart: (event: { expeditionId: string; userId?: string; agentId?: string; agentName?: string; role: string; timestamp: string }) => {
      setTypingUsers(prev => [...prev.filter(u => u.id !== (event.userId || event.agentId)), {
        id: event.userId || event.agentId || 'unknown',
        name: event.userId ? 'User' :
              event.agentId ? (agentDetails[event.agentId]?.name || event.agentName || event.agentId) :
              'Unknown',
        role: event.role as any
      }]);
    },
    onTypingStop: (event: { expeditionId: string; userId?: string; agentId?: string; role: string; timestamp: string }) => {
      setTypingUsers(prev => prev.filter(u => u.id !== (event.userId || event.agentId)));
    },
    onMessage: (event) => {
      // Real-time message handling is already done by useExpeditionChat
      // This is just for additional processing if needed
      console.log('[EXPEDITION CHAT] Real-time message received:', event);
    }
  });

  // Fetch agent details when expedition loads
  useEffect(() => {
    const fetchAgentDetails = async () => {
      if (!expedition?.assignedAgents || expedition.assignedAgents.length === 0) {
        return;
      }

      const details: Record<string, any> = {};
      
      for (const agentId of expedition.assignedAgents) {
        try {
          const agent = await agentAPI.getById(agentId);
          details[agentId] = agent;
        } catch (error) {
          console.error(`Failed to fetch agent ${agentId}:`, error);
          // Fallback for failed agent fetch
          details[agentId] = {
            id: agentId,
            name: agentId.slice(0, 8), // Use truncated ID as fallback
            category: 'general'
          };
        }
      }
      
      setAgentDetails(details);
    };

    fetchAgentDetails();
  }, [expedition?.assignedAgents]);

  // Enhanced utility functions
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {
        // Ignore audio play errors (user interaction required)
      });
    }
  }, [soundEnabled]);

  const exportMessages = useCallback(() => {
    const exportData = {
      expedition: {
        id: expeditionId,
        title: expedition?.title,
        starship: starshipSlug,
        exportedAt: new Date().toISOString()
      },
      messages: messages.map(msg => ({
        timestamp: msg.timestamp,
        role: msg.role,
        content: msg.content,
        messageType: msg.messageType,
        agentId: msg.agentId
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expedition-${expeditionId}-messages.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [expeditionId, expedition?.title, starshipSlug, messages]);

  const handleRetry = useCallback(async (action: string, params: any) => {
    const retryKey = `${action}-${JSON.stringify(params)}`;
    const currentAttempts = retryAttempts[retryKey] || 0;
    
    if (currentAttempts >= 3) {
      console.error(`Max retry attempts reached for ${action}`);
      return false;
    }
    
    setRetryAttempts(prev => ({ ...prev, [retryKey]: currentAttempts + 1 }));
    
    try {
      switch (action) {
        case 'start':
          await expeditionAPI.startExpedition(params.starshipId, params.expeditionId);
          break;
        case 'pause':
          await expeditionAPI.pauseExpedition(params.starshipId, params.expeditionId);
          break;
        case 'cancel':
          await expeditionAPI.cancelExpedition(params.starshipId, params.expeditionId);
          break;
        default:
          return false;
      }
      
      // Reset retry count on success
      setRetryAttempts(prev => {
        const newAttempts = { ...prev };
        delete newAttempts[retryKey];
        return newAttempts;
      });
      
      return true;
    } catch (error) {
      console.error(`Retry attempt ${currentAttempts + 1} failed for ${action}:`, error);
      return false;
    }
  }, [retryAttempts]);

  const handleReplyToMessage = useCallback((message: any) => {
    setReplyingTo(message);
    // Focus the message input
    const messageInput = document.querySelector('[data-testid="message-input"]') as HTMLElement;
    if (messageInput) {
      messageInput.focus();
    }
  }, []);

  const clearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Handle expedition actions with retry logic
  const handleStartExpedition = async () => {
    if (!expedition || !starshipId) return;
    
    setActionLoading('start');
    try {
      const success = await handleRetry('start', { starshipId, expeditionId });
      if (success) {
        startExpedition(expeditionId);
      }
    } catch (error) {
      console.error('Failed to start expedition:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseExpedition = async () => {
    if (!expedition || !starshipId) return;
    
    setActionLoading('pause');
    try {
      const success = await handleRetry('pause', { starshipId, expeditionId });
      if (success) {
        pauseExpedition(expeditionId);
      }
    } catch (error) {
      console.error('Failed to pause expedition:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelExpedition = async () => {
    if (!expedition || !starshipId) return;
    
    setActionLoading('cancel');
    try {
      const success = await handleRetry('cancel', { starshipId, expeditionId });
      if (success) {
        cancelExpedition(expeditionId);
      }
    } catch (error) {
      console.error('Failed to cancel expedition:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'f':
          event.preventDefault();
          setShowSearch(true);
          break;
        case 'e':
          event.preventDefault();
          exportMessages();
          break;
        case 'Enter':
          if (activeTab === 'chat') {
            event.preventDefault();
            const messageInput = document.querySelector('[data-testid="message-input"]') as HTMLElement;
            if (messageInput) {
              messageInput.focus();
            }
          }
          break;
      }
    }
    
    if (event.key === 'Escape') {
      if (showSearch) {
        setShowSearch(false);
      } else if (replyingTo) {
        clearReply();
      } else if (isFullscreen) {
        setIsFullscreen(false);
      }
    }
  }, [activeTab, showSearch, replyingTo, isFullscreen, exportMessages, clearReply]);

  // Add keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Play notification sound for new messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== 'user' && lastMessage.timestamp) {
        const messageTime = new Date(lastMessage.timestamp).getTime();
        const now = Date.now();
        // Only play sound for messages received in the last 5 seconds
        if (now - messageTime < 5000) {
          playNotificationSound();
        }
      }
    }
  }, [messages, playNotificationSound]);

  // Performance optimizations - memoize expensive computations
  const memoizedMessages = useMemo(() => {
    const messagesToShow = searchResults.length > 0 ? searchResults : messages;
    // Limit messages for performance (show last 100 messages)
    return messagesToShow.slice(-100);
  }, [messages, searchResults]);

  const memoizedAgentList = useMemo(() => {
    return expedition?.assignedAgents.map(agentId => {
      const agentDetail = agentDetails[agentId];
      return {
        id: agentId,
        name: agentDetail?.name || agentId
      };
    }) || [];
  }, [expedition?.assignedAgents, agentDetails]);

  const memoizedAvailableAgents = useMemo(() => {
    return expedition?.assignedAgents.map(agentId => {
      const agentDetail = agentDetails[agentId];
      return {
        id: agentId,
        name: agentDetail?.name || agentId,
        status: 'online' as const
      };
    }) || [];
  }, [expedition?.assignedAgents, agentDetails]);

  // Virtual scrolling for large message lists
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const containerHeight = 600; // Approximate height
  const itemHeight = 80; // Approximate message height

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(start + Math.ceil(containerHeight / itemHeight) + 5, memoizedMessages.length);
    
    setVisibleRange({ start, end });
  }, [memoizedMessages.length, itemHeight, containerHeight]);

  const visibleMessages = useMemo(() => {
    if (memoizedMessages.length <= 50) return memoizedMessages;
    return memoizedMessages.slice(visibleRange.start, visibleRange.end);
  }, [memoizedMessages, visibleRange]);

  // Get status styling
  const getStatusConfig = (status: Expedition['status']) => {
    switch (status) {
      case 'draft':
        return { color: 'bg-gray-500', label: 'Draft', variant: 'secondary' as const };
      case 'planning':
        return { color: 'bg-blue-500', label: 'Planning', variant: 'default' as const };
      case 'in-progress':
        return { color: 'bg-yellow-500', label: 'In Progress', variant: 'default' as const };
      case 'review':
        return { color: 'bg-purple-500', label: 'Review', variant: 'secondary' as const };
      case 'completed':
        return { color: 'bg-green-500', label: 'Completed', variant: 'default' as const };
      case 'failed':
        return { color: 'bg-red-500', label: 'Failed', variant: 'destructive' as const };
      case 'cancelled':
        return { color: 'bg-gray-500', label: 'Cancelled', variant: 'secondary' as const };
      default:
        return { color: 'bg-gray-500', label: status, variant: 'secondary' as const };
    }
  };

  if (expeditionLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading expedition...</p>
        </div>
      </div>
    );
  }

  if (expeditionError || !expedition) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="p-6 text-center">
          <p className="text-red-500 mb-4">Error loading expedition</p>
          <p className="text-sm text-muted-foreground mb-4">
            {typeof expeditionError === 'string' ? expeditionError : expeditionError?.message || 'Expedition not found'}
          </p>
          <Button onClick={refreshExpedition} variant="outline">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  const statusConfig = getStatusConfig(expedition.status);

  return (
    <TooltipProvider>
      <div className={`h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
        {/* Hidden audio element for notifications */}
        <audio
          ref={audioRef}
          preload="auto"
          aria-hidden="true"
        >
          <source src="/sounds/notification.mp3" type="audio/mpeg" />
          <source src="/sounds/notification.ogg" type="audio/ogg" />
        </audio>

        {/* Header */}
        <header
          className="flex items-center justify-between p-6 border-b"
          role="banner"
          aria-label="Expedition chat header"
        >
          <div className="flex items-center space-x-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    href={`/ship/${starshipSlug}/expeditions`}
                    aria-label="Back to expeditions list"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Expeditions
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Return to expeditions list (Alt+B)</TooltipContent>
            </Tooltip>
            <div>
              <h1 className="text-xl font-semibold" id="expedition-title">
                {expedition.title}
              </h1>
              <p className="text-sm text-muted-foreground" id="expedition-details">
                Starship: {starshipSlug} • Expedition ID: {expeditionId.slice(0, 8)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Enhanced Controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  aria-label={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {soundEnabled ? 'Disable' : 'Enable'} sound notifications
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={exportMessages}
                  aria-label="Export chat messages"
                  disabled={messages.length === 0}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export messages (Ctrl+E)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? 'Exit' : 'Enter'} fullscreen (F11)
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6" />

            <Badge
              variant={statusConfig.variant}
              aria-label={`Expedition status: ${statusConfig.label}`}
            >
              {statusConfig.label}
            </Badge>
          
          {/* Action Buttons */}
          {expedition.status === 'draft' && (
            <Button 
              onClick={handleStartExpedition}
              disabled={actionLoading === 'start'}
              size="sm"
            >
              {actionLoading === 'start' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start
            </Button>
          )}
          
          {expedition.status === 'in-progress' && (
            <Button 
              onClick={handlePauseExpedition}
              disabled={actionLoading === 'pause'}
              variant="outline"
              size="sm"
            >
              {actionLoading === 'pause' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Pause
            </Button>
          )}
          
          {['draft', 'planning', 'in-progress'].includes(expedition.status) && (
            <Button 
              onClick={handleCancelExpedition}
              disabled={actionLoading === 'cancel'}
              variant="destructive"
              size="sm"
            >
              {actionLoading === 'cancel' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Cancel
            </Button>
          )}
          </div>
        </header>

        {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel - Chat */}
        <div className="flex-1 flex flex-col">
          {/* Tab Navigation */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-4 w-4 inline mr-2" />
              Chat
              {typingUsers.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('progress')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'progress'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-4 w-4 inline mr-2" />
              Progress
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'tasks'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-2" />
              Tasks ({tasks.length})
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'participants'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="h-4 w-4 inline mr-2" />
              Participants ({expedition.assignedAgents.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'chat' && (
              <div className="h-full flex flex-col relative">
                {/* Search */}
                {showSearch && (
                  <MessageSearch
                    messages={messages}
                    onSearchResults={(results, query) => {
                      setSearchResults(results);
                    }}
                    onHighlightMessage={(messageId) => {
                      setHighlightedMessageId(messageId);
                      const messageElement = document.getElementById(`message-${messageId}`);
                      if (messageElement) {
                        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    availableAgents={memoizedAgentList}
                  />
                )}

                {/* Messages */}
                <ScrollArea
                  className="flex-1 p-4 max-h-full"
                  onScrollCapture={handleScroll}
                  role="log"
                  aria-label="Expedition chat messages"
                  aria-live="polite"
                  aria-atomic="false"
                >
                  <div
                    className="space-y-4"
                    style={{
                      minHeight: memoizedMessages.length > 50 ? `${memoizedMessages.length * itemHeight}px` : 'auto'
                    }}
                  >
                    {messagesLoading && messages.length === 0 ? (
                      <div className="text-center text-muted-foreground" role="status" aria-label="Loading messages">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        Loading messages...
                      </div>
                    ) : messagesError ? (
                      <div className="text-center text-red-500" role="alert" aria-label="Error loading messages">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                        Error loading messages: {messagesError}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted-foreground" role="status">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No messages yet</p>
                        <p className="text-sm">Start the conversation to coordinate with your team!</p>
                      </div>
                    ) : (
                      <>
                        {/* Virtual scrolling spacer for items above visible range */}
                        {visibleRange.start > 0 && (
                          <div style={{ height: `${visibleRange.start * itemHeight}px` }} />
                        )}
                        
                        {visibleMessages.map((message, index) => (
                          <div
                            key={message.id}
                            id={`message-${message.id}`}
                            className={highlightedMessageId === message.id ? 'ring-2 ring-blue-500 rounded-lg' : ''}
                            role="article"
                            aria-label={`Message from ${message.role} at ${new Date(message.timestamp).toLocaleTimeString()}`}
                            tabIndex={0}
                          >
                            <MessageBubble
                              message={message}
                              showReactions={true}
                              showStatus={true}
                              enableActions={true}
                              onReply={handleReplyToMessage}
                              onReact={(messageId, emoji) => {
                                console.log('React to message:', messageId, emoji);
                              }}
                              onCopy={(content) => {
                                navigator.clipboard.writeText(content);
                              }}
                            />
                          </div>
                        ))}
                        
                        {/* Virtual scrolling spacer for items below visible range */}
                        {visibleRange.end < memoizedMessages.length && (
                          <div style={{ height: `${(memoizedMessages.length - visibleRange.end) * itemHeight}px` }} />
                        )}
                      </>
                    )}
                    
                    {/* Typing Indicator */}
                    {typingUsers.length > 0 && (
                      <TypingIndicator typingUsers={typingUsers} />
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t">
                  <MessageInput
                    onSendMessage={async (content, messageType, agentId) => {
                      await sendMessage(content, messageType, agentId);
                    }}
                    disabled={sending || expedition.status === 'completed' || expedition.status === 'cancelled'}
                    placeholder={
                      expedition.status === 'completed'
                        ? 'Expedition completed'
                        : expedition.status === 'cancelled'
                        ? 'Expedition cancelled'
                        : 'Type your message...'
                    }
                    showMessageType={true}
                    showAgentSelector={expedition.assignedAgents.length > 0}
                    showFormatting={true}
                    showAttachments={true}
                    availableAgents={memoizedAvailableAgents}
                    replyingTo={replyingTo}
                    data-testid="message-input"
                    className="p-4"
                    onTypingStart={() => startTyping(expeditionId)}
                    onTypingStop={() => stopTyping(expeditionId)}
                  />
                </div>

                {/* Search toggle button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => setShowSearch(!showSearch)}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            )}

            {activeTab === 'progress' && (
              <div className="p-4">
                <ExpeditionProgress expedition={expedition} />
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="p-4">
                <TaskTimeline tasks={tasks} />
              </div>
            )}

            {activeTab === 'participants' && (
              <div className="p-4">
                <ParticipantsList 
                  agentIds={expedition.assignedAgents}
                  starshipSlug={starshipSlug}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Expedition Info */}
        <div className="w-80 border-l bg-muted/20">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Expedition Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Objective</p>
                  <p className="text-sm">{expedition.objective}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{expedition.description}</p>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <Badge variant="outline" className="text-xs">
                      {expedition.priority}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-xs">
                      {expedition.estimatedDuration ? `${expedition.estimatedDuration}m` : 'No estimate'}
                    </p>
                  </div>
                </div>
                {expedition.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {expedition.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}