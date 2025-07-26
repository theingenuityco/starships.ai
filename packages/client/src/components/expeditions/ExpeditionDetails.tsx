'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Users,
  Clock,
  MessageSquare,
  FileText,
  AlertCircle,
  CheckCircle2,
  Activity,
  Target,
  Calendar,
  RefreshCw,
  Loader2,
  Send,
  Bot,
  User,
  Copy,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { useExpeditionData } from '@/hooks/useExpeditionData';
import { useExpeditionChat } from '@/hooks/useExpeditionChat';
import { expeditionAPI } from '@/lib/expeditionApi';
import { agentAPI } from '@/lib/api';
import type { Expedition, ExpeditionStatus, ExpeditionTask } from '@starships/protocol';

interface ExpeditionDetailsProps {
  starshipSlug: string;
  expeditionId: string;
}

export function ExpeditionDetails({ starshipSlug, expeditionId }: ExpeditionDetailsProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string>('first-officer');
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [starshipId, setStarshipId] = useState<string>('');
  const [agentDetails, setAgentDetails] = useState<Record<string, any>>({});
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  // Fetch starship by slug
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
        console.error('Failed to fetch starship:', error);
      }
    };

    if (starshipSlug) {
      fetchStarshipBySlug();
    }
  }, [starshipSlug]);

  // Data hooks - only fetch when starshipId is available
  const {
    expedition,
    expeditionLoading,
    expeditionError,
    tasks,
    refreshExpedition
  } = useExpeditionData({
    starshipId,
    expeditionId,
    autoRefresh: false, // Disable auto-refresh to prevent chat re-renders
    refreshInterval: 30000
  });

  // Chat hook - only use when starshipId is available
  const {
    messages: rawMessages,
    loading: messagesLoading,
    sending,
    sendMessage,
    messagesEndRef
  } = useExpeditionChat({
    expeditionId,
    starshipId: starshipId || '', // Provide empty string as fallback
    autoScroll: true
  });

  // Filter messages to remove old workflow messages
  const messages = useMemo(() => {
    if (!rawMessages || rawMessages.length === 0) return [];
    
    // If expedition is in draft/review/failed/completed/cancelled, filter out old workflow messages
    if (['draft', 'review', 'failed', 'completed', 'cancelled'].includes(expedition?.status || '')) {
      return rawMessages.filter(message => {
        // Check if it's a workflow message
        const isWorkflowMessage = message.content.includes('**Phase Transition**') || 
                                message.content.includes('**Objective Analysis Complete**') ||
                                message.content.includes('**Task Planning Complete**') ||
                                message.content.includes('**Pre-selected Agents Assigned**') ||
                                message.content.includes('Workflow completed but no final result');
        
        if (isWorkflowMessage) {
          // Skip old workflow messages (older than 5 minutes)
          const messageAge = Date.now() - new Date(message.timestamp).getTime();
          return messageAge < 300000; // 5 minutes
        }
        
        return true;
      });
    }
    
    return rawMessages;
  }, [rawMessages, expedition?.status]);
  

  // Debug expedition status
  useEffect(() => {
    if (expedition) {
      console.log('[EXPEDITION DETAILS] Expedition loaded:', {
        id: expedition.id,
        status: expedition.status,
        workflowState: expedition.workflowState,
        messagesCount: messages.length
      });
    }
  }, [expedition, messages.length]);


  // Fetch agent details
  useEffect(() => {
    const fetchAgentDetails = async () => {
      if (!expedition?.assignedAgents?.length) return;

      const details: Record<string, any> = {};
      
      for (const agentId of expedition.assignedAgents) {
        try {
          const agent = await agentAPI.getById(agentId);
          details[agentId] = agent;
        } catch (error) {
          console.error(`Failed to fetch agent ${agentId}:`, error);
          details[agentId] = {
            id: agentId,
            name: agentId.slice(0, 8),
            category: 'general'
          };
        }
      }
      
      setAgentDetails(details);
    };

    fetchAgentDetails();
  }, [expedition?.assignedAgents]);

  // Handle expedition actions
  const handleAction = async (action: 'start' | 'pause' | 'cancel') => {
    if (!expedition || !starshipId) return;
    
    setActionLoading(action);
    try {
      switch (action) {
        case 'start':
          await expeditionAPI.startExpedition(starshipId, expeditionId);
          break;
        case 'pause':
          await expeditionAPI.pauseExpedition(starshipId, expeditionId);
          break;
        case 'cancel':
          await expeditionAPI.cancelExpedition(starshipId, expeditionId);
          break;
      }
      await refreshExpedition();
    } catch (error) {
      console.error(`Failed to ${action} expedition:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || sending) return;
    
    const content = messageInput.trim();
    setMessageInput('');
    // Pass undefined for First Officer, agentId for specific agent
    const participantId = selectedParticipant === 'first-officer' ? undefined : selectedParticipant;
    
    // Send message
    await sendMessage(content, 'user-input', participantId);
  };

  // Get status styling
  const getStatusConfig = (status: ExpeditionStatus) => {
    switch (status) {
      case 'draft':
        return {
          icon: FileText,
          label: 'Draft',
          className: 'text-slate-600 bg-slate-50 dark:bg-slate-900/50',
          dotColor: 'bg-slate-400'
        };
      case 'planning':
        return {
          icon: Target,
          label: 'Planning',
          className: 'text-blue-600 bg-blue-50 dark:bg-blue-900/50',
          dotColor: 'bg-blue-500',
          pulse: true
        };
      case 'in-progress':
        return {
          icon: Activity,
          label: 'In Progress',
          className: 'text-amber-600 bg-amber-50 dark:bg-amber-900/50',
          dotColor: 'bg-amber-500',
          pulse: true
        };
      case 'review':
        return {
          icon: AlertCircle,
          label: 'Review',
          className: 'text-purple-600 bg-purple-50 dark:bg-purple-900/50',
          dotColor: 'bg-purple-500'
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completed',
          className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/50',
          dotColor: 'bg-emerald-500'
        };
      case 'failed':
        return {
          icon: AlertCircle,
          label: 'Failed',
          className: 'text-red-600 bg-red-50 dark:bg-red-900/50',
          dotColor: 'bg-red-500'
        };
      case 'cancelled':
        return {
          icon: Square,
          label: 'Cancelled',
          className: 'text-gray-600 bg-gray-50 dark:bg-gray-900/50',
          dotColor: 'bg-gray-400'
        };
      default:
        return {
          icon: FileText,
          label: status,
          className: 'text-gray-600 bg-gray-50 dark:bg-gray-900/50',
          dotColor: 'bg-gray-400'
        };
    }
  };

  // Show loading state while fetching starshipId or expedition
  // Also show loading if we don't have an expedition yet and no error occurred
  if (!starshipId || expeditionLoading || (!expedition && !expeditionError)) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            {!starshipId ? 'Loading starship...' : 'Loading expedition...'}
          </p>
        </div>
      </div>
    );
  }

  // Only show error if we have an actual error
  if (expeditionError || (!expedition && starshipId)) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="p-8 text-center max-w-md shadow-lg">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Unable to Load Expedition</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {expeditionError?.message || 'The expedition could not be found or you may not have access to it.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={refreshExpedition} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/ship/${starshipSlug}/expeditions`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to List
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const statusConfig = getStatusConfig(expedition.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Modern Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/ship/${starshipSlug}/expeditions`}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              
              <div>
                <h1 className="text-2xl font-bold">{expedition.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {expedition.mission}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${statusConfig.className}`}
              >
                <div className={`h-2 w-2 rounded-full ${statusConfig.dotColor} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                <span>{statusConfig.label}</span>
              </div>

              {/* Action Buttons */}
              {expedition.status === 'draft' && (
                <Button 
                  onClick={() => handleAction('start')}
                  disabled={actionLoading === 'start'}
                  size="sm"
                >
                  {actionLoading === 'start' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Expedition
                </Button>
              )}
              
              {expedition.status === 'in-progress' && (
                <Button 
                  onClick={() => handleAction('pause')}
                  disabled={actionLoading === 'pause'}
                  variant="outline"
                  size="sm"
                >
                  {actionLoading === 'pause' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Pause className="h-4 w-4 mr-2" />
                  )}
                  Pause
                </Button>
              )}
              
              {['draft', 'planning', 'in-progress'].includes(expedition.status) && (
                <Button 
                  onClick={() => handleAction('cancel')}
                  disabled={actionLoading === 'cancel'}
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {actionLoading === 'cancel' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Square className="h-4 w-4 mr-2" />
                  )}
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex gap-6 p-4 lg:p-6">
          {/* Left Column - Chat */}
          <div className="flex-1 min-w-0 flex">
            <div className="flex-1 flex flex-col bg-card/50 backdrop-blur-sm border border-muted rounded-lg overflow-hidden">
              <div className="border-b bg-muted/5 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Mission Communication</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {messages.length} messages • {expedition.assignedAgents.length} participants
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Live Chat
                  </Badge>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-4">
                    {(messagesLoading || !starshipId) && messages.length === 0 ? (
                      <div className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading messages...</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full min-h-[400px]">
                        <div className="text-center max-w-sm">
                          <div className="h-16 w-16 rounded-full bg-muted/50 mx-auto mb-4 flex items-center justify-center">
                            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                          <h3 className="font-semibold text-lg mb-2">Start the Conversation</h3>
                          <p className="text-sm text-muted-foreground">
                            Send a message to coordinate with your agents and track mission progress.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {messages.map((message, index) => {
                          const isUser = message.role === 'user';
                          const isSystem = message.role === 'system';
                          const agent = message.agentId ? agentDetails[message.agentId] : null;
                          const isOptimistic = message.id.startsWith('temp-');
                          
                          // System messages styling
                          if (isSystem) {
                            return (
                              <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="flex justify-center my-2"
                              >
                                <div className="bg-muted/30 text-muted-foreground text-xs px-3 py-1.5 rounded-full">
                                  {message.content}
                                </div>
                              </motion.div>
                            );
                          }
                          
                          return (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
                            >
                              {!isUser && (
                                <div className="flex-shrink-0 pt-6">
                                  <div className="relative">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-2 ring-background shadow-sm">
                                      {message.role === 'first-officer' ? (
                                        <Bot className="h-5 w-5 text-primary" />
                                      ) : (
                                        <span className="text-xs font-semibold text-primary">
                                          {agent?.name?.slice(0, 2).toUpperCase() || 'AG'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
                                  </div>
                                </div>
                              )}
                              
                              <div className={`flex flex-col gap-1 max-w-[70%] ${isUser ? 'items-end' : ''}`}>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                                  <span className="font-semibold">
                                    {isUser ? 'You' : agent?.name || message.role.replace('-', ' ')}
                                  </span>
                                  <span className="opacity-60">
                                    {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                                      hour: 'numeric', 
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                                  <div className="group relative">
                                    <div
                                      className={`px-4 py-2.5 ${
                                        isUser
                                          ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-md shadow-sm'
                                          : 'bg-muted/50 border border-border rounded-2xl rounded-tl-md shadow-sm'
                                      }`}
                                    >
                                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                    {/* Show sending indicator on optimistic messages */}
                                    {isUser && isOptimistic && (
                                      <div className="absolute -bottom-6 right-0 flex items-center gap-1 text-xs text-muted-foreground">
                                        <span className="italic">Sending...</span>
                                      </div>
                                    )}
                                    <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(message.content);
                                      // Show copied feedback
                                      const button = e.currentTarget;
                                      const icon = button.querySelector('svg');
                                      if (icon) {
                                        icon.classList.add('hidden');
                                        const checkIcon = document.createElement('div');
                                        checkIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                                        button.appendChild(checkIcon);
                                        setTimeout(() => {
                                          icon.classList.remove('hidden');
                                          checkIcon.remove();
                                        }, 1500);
                                      }
                                    }}
                                    className={`absolute ${isUser ? '-left-7' : '-right-7'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground`}
                                    title="Copy message"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  </div>
                                </div>
                              </div>
                              
                              {isUser && (
                                <div className="flex-shrink-0 pt-6">
                                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-sm">
                                    <User className="h-5 w-5 text-primary-foreground" />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Message Input */}
                <div className="border-t bg-muted/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-muted-foreground">Send to:</span>
                    <Select
                      value={selectedParticipant}
                      onValueChange={setSelectedParticipant}
                      disabled={sending || ['cancelled'].includes(expedition.status)}
                    >
                      <SelectTrigger className="w-48 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first-officer">
                          <div className="flex items-center gap-2">
                            <Bot className="h-3 w-3" />
                            <span>First Officer</span>
                          </div>
                        </SelectItem>
                        {expedition.assignedAgents.map((agentId) => {
                          const agent = agentDetails[agentId];
                          return (
                            <SelectItem key={agentId} value={agentId}>
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-primary/20" />
                                <span>{agent?.name || agentId.slice(0, 8)}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex gap-3"
                  >
                    <div className="flex-1 relative">
                      <textarea
                        ref={messageInputRef}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder={
                          ['cancelled'].includes(expedition.status)
                            ? `Expedition cancelled - chat disabled`
                            : 'Type a message...'
                        }
                        disabled={sending || ['cancelled'].includes(expedition.status)}
                        className="w-full min-h-[44px] max-h-[120px] px-4 py-3 pr-12 text-sm bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
                        rows={1}
                      />
                      <div className="absolute bottom-2 right-2 flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {messageInput.length > 0 && `${messageInput.length}`}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      size="default"
                      disabled={!messageInput.trim() || sending || ['cancelled'].includes(expedition.status)}
                      className="rounded-xl px-6"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Info */}
          <aside className="w-80 flex-shrink-0 overflow-y-auto">
            <div className="space-y-4">
              {/* Overview Card */}
              <Card className="bg-card/50 backdrop-blur-sm border-muted">
              <CardHeader>
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(expedition.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Assigned Agents</p>
                    <p className="font-medium">{expedition.assignedAgents.length} agents</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Tasks</p>
                    <p className="font-medium">{tasks.length} total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

              {/* Tasks Card */}
              <Card className="bg-card/50 backdrop-blur-sm border-muted">
              <CardHeader>
                <CardTitle className="text-base">Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.slice(0, 5).map((task) => (
                      <div key={task.id} className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          task.status === 'completed' ? 'bg-emerald-500' :
                          task.status === 'in-progress' ? 'bg-amber-500' :
                          'bg-gray-300'
                        }`} />
                        <span className="text-sm truncate">{task.title}</span>
                      </div>
                    ))}
                    {tasks.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        +{tasks.length - 5} more tasks
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

              {/* Agents Card */}
              <Card className="bg-card/50 backdrop-blur-sm border-muted">
              <CardHeader>
                <CardTitle className="text-base">Assigned Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expedition.assignedAgents.map((agentId) => {
                    const agent = agentDetails[agentId];
                    return (
                      <div key={agentId} className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {agent?.name?.slice(0, 2).toUpperCase() || 'AG'}
                          </span>
                        </div>
                        <span className="text-sm">{agent?.name || agentId.slice(0, 8)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}