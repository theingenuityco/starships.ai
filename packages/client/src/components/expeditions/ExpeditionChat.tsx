'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Search
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
import { useExpeditionSocket } from '@/hooks/useExpeditionSocket';
import { expeditionAPI } from '@/lib/expeditionApi';

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

  // Get starship ID from the slug first
  const [starshipId, setStarshipId] = useState<string>('');

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

  // Socket integration
  const {
    startExpedition,
    pauseExpedition,
    cancelExpedition,
    error: socketError,
    realtimeData
  } = useExpeditionSocket({
    expeditionId,
    onExpeditionUpdated: () => {
      refreshExpedition();
    },
    onExpeditionStarted: () => {
      refreshExpedition();
    },
    onExpeditionPaused: () => {
      refreshExpedition();
    },
    onExpeditionCancelled: () => {
      refreshExpedition();
    },
    onExpeditionCompleted: () => {
      refreshExpedition();
    },
    onTypingStart: (event) => {
      setTypingUsers(prev => [...prev.filter(u => u.id !== event.userId), {
        id: event.userId || event.agentId || 'unknown',
        name: event.userId ? 'User' : event.agentId ? `Agent ${event.agentId.slice(0, 8)}` : 'Unknown',
        role: event.role
      }]);
    },
    onTypingStop: (event) => {
      setTypingUsers(prev => prev.filter(u => u.id !== (event.userId || event.agentId)));
    }
  });

  // Handle expedition actions
  const handleStartExpedition = async () => {
    if (!expedition || !starshipId) return;
    
    setActionLoading('start');
    try {
      await expeditionAPI.startExpedition(starshipId, expeditionId);
      startExpedition(expeditionId);
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
      await expeditionAPI.pauseExpedition(starshipId, expeditionId);
      pauseExpedition(expeditionId);
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
      await expeditionAPI.cancelExpedition(starshipId, expeditionId);
      cancelExpedition(expeditionId);
    } catch (error) {
      console.error('Failed to cancel expedition:', error);
    } finally {
      setActionLoading(null);
    }
  };

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/ship/${starshipSlug}/expeditions`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Expeditions
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{expedition.title}</h1>
            <p className="text-sm text-muted-foreground">
              Starship: {starshipSlug} • Expedition ID: {expeditionId.slice(0, 8)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Badge variant={statusConfig.variant}>
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
      </div>

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
          <div className="flex-1 overflow-hidden">
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
                    availableAgents={expedition.assignedAgents.map(agentId => ({
                      id: agentId,
                      name: `Agent ${agentId.slice(0, 8)}`
                    }))}
                  />
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messagesLoading && messages.length === 0 ? (
                      <div className="text-center text-muted-foreground">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        Loading messages...
                      </div>
                    ) : messagesError ? (
                      <div className="text-center text-red-500">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                        Error loading messages: {messagesError}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No messages yet</p>
                        <p className="text-sm">Start the conversation to coordinate with your team!</p>
                      </div>
                    ) : (
                      (searchResults.length > 0 ? searchResults : messages).map((message) => (
                        <div
                          key={message.id}
                          id={`message-${message.id}`}
                          className={highlightedMessageId === message.id ? 'ring-2 ring-blue-500 rounded-lg' : ''}
                        >
                          <MessageBubble
                            message={message}
                            showReactions={true}
                            showStatus={true}
                            enableActions={true}
                            onReply={(msg) => {
                              console.log('Reply to message:', msg.id);
                            }}
                            onReact={(messageId, emoji) => {
                              console.log('React to message:', messageId, emoji);
                            }}
                            onCopy={(content) => {
                              navigator.clipboard.writeText(content);
                            }}
                          />
                        </div>
                      ))
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
                    availableAgents={expedition.assignedAgents.map(agentId => ({
                      id: agentId,
                      name: `Agent ${agentId.slice(0, 8)}`,
                      status: 'online' as const
                    }))}
                    className="p-4"
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
  );
}