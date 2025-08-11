'use client';

import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, Users, Clock, Calendar, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { missionApi } from '@/lib/missionApi';
import { starshipAPI, agentAPI } from '@/lib/api';
import { useSocket } from '@/providers/socket-provider';
import SocketClient from '@/lib/socket-client';
import type { Mission, MissionStatus, MissionMessage, Agent } from '@starships/protocol';

interface MissionDetailPageProps {
  params: Promise<{
    slug: string;
    missionId: string;
  }>;
}

const statusColors: Record<MissionStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-yellow-100 text-yellow-800'
};

const statusIcons: Record<MissionStatus, React.ReactNode> = {
  draft: <Clock className="w-4 h-4" />,
  active: <Target className="w-4 h-4" />,
  completed: <Target className="w-4 h-4" />,
  failed: <Target className="w-4 h-4" />,
  cancelled: <Target className="w-4 h-4" />
};

export default function MissionDetailPage({ params }: MissionDetailPageProps) {
  const { slug, missionId } = use(params);
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<MissionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // WebSocket state
  const { isConnected } = useSocket();
  const socketClient = SocketClient.getInstance();

  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState({
    timeline: false,
    description: false,
    agents: false,
    progress: false
  });

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Function to get agent emoji based on name and category (same logic as AgentCard)
  const getAgentEmoji = (agent: Agent) => {
    if (agent.name.toLowerCase().includes('support') || agent.category === 'support') {
      return '🎧'; // Headphones emoji
    } else if (
      agent.name.toLowerCase().includes('data') ||
      agent.name.toLowerCase().includes('analyst') ||
      agent.category === 'analysis'
    ) {
      return '📊'; // Bar chart emoji
    } else if (agent.name.toLowerCase().includes('creative') || agent.category === 'creative') {
      return '✏️'; // Pencil emoji
    } else if (
      agent.name.toLowerCase().includes('code') ||
      agent.name.toLowerCase().includes('coding') ||
      agent.category === 'coding'
    ) {
      return '🔍'; // Magnifying glass emoji
    } else {
      return '🤖'; // Robot emoji as default
    }
  };

  // Function to get phase progress information
  const getPhaseProgress = (currentPhase: string) => {
    const phases = [
      { key: 'init', label: 'Init', description: 'Setting up mission context' },
      { key: 'welcome', label: 'Welcome', description: 'Mission introduction' },
      { key: 'converse', label: 'Converse', description: 'Active conversation phase' }
    ];

    const currentIndex = phases.findIndex(phase => phase.key === currentPhase);
    
    return phases.map((phase, index) => ({
      ...phase,
      isCompleted: index < currentIndex,
      isCurrent: index === currentIndex,
      isPending: index > currentIndex
    }));
  };

  // Central message handler - single source of truth
  const addMessageToUI = (message: MissionMessage) => {
    setMessages(prev => [...prev, message]);
  };

  // WebSocket setup for mission messages
  useEffect(() => {
    if (!isConnected || !socketClient) return;

    const handleMissionMessage = (data: any) => {
      console.log('[MISSION] Received WebSocket message:', data);
      if (data.message && data.missionId === missionId) {
        addMessageToUI(data.message);
      }
    };

    // Listen for mission messages
    socketClient.on('mission:message-sent', handleMissionMessage);

    // Join mission room for real-time updates
    socketClient.emit('mission:join-room', missionId);

    return () => {
      socketClient.off('mission:message-sent', handleMissionMessage);
      socketClient.emit('mission:leave-room', missionId);
    };
  }, [isConnected, missionId, socketClient]);

  // Fetch agent details
  const loadAgents = async (agentIds: string[]) => {
    try {
      setAgentsLoading(true);
      const agentPromises = agentIds.map(agentId => agentAPI.getById(agentId));
      const agentResults = await Promise.all(agentPromises);
      setAgents(agentResults);
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    const loadMission = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await missionApi.getMissionById(missionId);
        
        if (response.error) {
          setError(response.error);
        } else if (response.data) {
          setMission(response.data.mission);
          
          // Load agent details if mission has agents
          if (response.data.mission.agentIds && response.data.mission.agentIds.length > 0) {
            loadAgents(response.data.mission.agentIds);
          } else {
            setAgentsLoading(false);
          }
          
          // Load chat history - LangGraph will handle greetings automatically
          const historyResponse = await missionApi.getMessageHistory(missionId);
          if (historyResponse.data) {
            setMessages(historyResponse.data.messages);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load mission');
      } finally {
        setLoading(false);
      }
    };

    loadMission();
  }, [missionId]);

  const handleBack = () => {
    router.back();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  useEffect(() => {
    scrollToBottom();
    // Focus input after new messages (slight delay to ensure render)
    setTimeout(focusInput, 100);
  }, [messages]);

  // Focus input on component mount (chat opened)
  useEffect(() => {
    focusInput();
  }, []);


  const handleSendMessage = async () => {
    if (!newMessage.trim() || chatLoading) return;

    const messageContent = newMessage;
    setNewMessage('');
    setChatLoading(true);

    try {
      // WebSocket-first: Server saves messages to DB and emits WebSocket events  
      // WebSocket handler will automatically add both user and orchestrator messages to UI
      const response = await missionApi.sendMessage(missionId, messageContent);
      
      // HTTP fallback: Only add messages if WebSocket is not connected
      if (!isConnected && response.data) {
        console.log('[MISSION] WebSocket disconnected, using HTTP fallback for messages');
        
        // Add user message
        const userMessage: MissionMessage = {
          id: `user-${Date.now()}`,
          missionId,
          role: 'user',
          content: messageContent,
          timestamp: new Date().toISOString(),
          senderName: 'You'
        };
        addMessageToUI(userMessage);
        
        // Add orchestrator response
        const orchestratorMessage: MissionMessage = {
          id: `orchestrator-${Date.now()}`,
          missionId,
          role: 'orchestrator',
          content: response.data.reply,
          timestamp: new Date().toISOString(),
          senderName: 'Mission Orchestrator'
        };
        addMessageToUI(orchestratorMessage);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // On error, always show user message (they typed it)
      const userMessage: MissionMessage = {
        id: `user-error-${Date.now()}`,
        missionId,
        role: 'user',
        content: messageContent,
        timestamp: new Date().toISOString(),
        senderName: 'You'
      };
      addMessageToUI(userMessage);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="h-full command-deck-bg p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="h-full command-deck-bg p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️ Error</div>
          <p className="text-muted-foreground mb-4">{error || 'Mission not found'}</p>
          <Button onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen command-deck-bg flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            {statusIcons[mission.status]}
            <h1 className="text-2xl font-bold">{mission.name}</h1>
            <Badge className={statusColors[mission.status]}>
              {mission.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content - Split Layout */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Chat Area - Main Content */}
        <div className="flex-1 flex flex-col min-h-0 bg-background">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="pb-3 p-4 lg:p-6 flex-shrink-0">
              <h2 className="text-lg font-semibold">Mission Orchestrator</h2>
            </div>
            <div className="flex flex-col flex-1 p-4 lg:p-6 pt-0 min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 lg:pr-4 min-h-0">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[280px] sm:max-w-md lg:max-w-lg px-4 py-3 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
                      <p className="text-xs mt-2 opacity-70">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted text-muted-foreground px-4 py-3 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                        <span className="text-sm">Orchestrator is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {/* Input */}
              <div className="flex space-x-2 lg:space-x-3 pt-4 border-t flex-shrink-0">
                <Input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask the orchestrator..."
                  disabled={chatLoading}
                  className="text-sm"
                />
                <Button onClick={handleSendMessage} disabled={chatLoading || !newMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Mission Details */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-gradient-to-b from-background to-muted/5 flex-shrink-0">
          {/* Enhanced Content Sections */}
          <div className="h-full overflow-y-auto p-3 custom-scrollbar">
            <div className="space-y-4 mt-4">
              
              {/* Progress Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 group">
                  <button
                    onClick={() => toggleSection('progress')}
                    className="flex items-center gap-2 hover:text-muted-foreground transition-colors"
                  >
                    {collapsedSections.progress ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Progress
                  </h4>
                </div>
                {!collapsedSections.progress && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {getPhaseProgress(mission.phase).map((phase, index, array) => (
                      <div key={phase.key} className="relative">
                        <div className="group relative mx-3 px-2 py-1 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative flex-shrink-0">
                              <div className={`p-1.5 rounded-md transition-all duration-300 ${
                                phase.isCurrent 
                                  ? 'bg-primary/20' 
                                  : phase.isCompleted
                                  ? 'bg-green-500/20'
                                  : 'bg-muted/30 group-hover:bg-muted/50'
                              }`}>
                                {phase.isCompleted ? (
                                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                                    <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                                  </div>
                                ) : phase.isCurrent ? (
                                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                  </div>
                                ) : (
                                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`font-semibold text-sm truncate block transition-colors leading-tight ${
                                phase.isCurrent 
                                  ? 'text-primary' 
                                  : phase.isCompleted
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-muted-foreground group-hover:text-foreground'
                              }`}>
                                {phase.label}
                              </span>
                              <span className="text-xs text-muted-foreground leading-tight">
                                {phase.description}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Timeline connector */}
                        {index < array.length - 1 && (
                          <div className="mx-3 pl-2">
                            <div className="ml-[12px] w-0.5 h-4 bg-border" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 group">
                  <button
                    onClick={() => toggleSection('description')}
                    className="flex items-center gap-2 hover:text-muted-foreground transition-colors"
                  >
                    {collapsedSections.description ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Description
                  </h4>
                </div>
                {!collapsedSections.description && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                    <div className="group relative mx-3 px-2 py-1.5 rounded-lg bg-muted/20 transition-all duration-300">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {mission.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Agents Section */}
              {mission.agentIds && mission.agentIds.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 group">
                    <button
                      onClick={() => toggleSection('agents')}
                      className="flex items-center gap-2 hover:text-muted-foreground transition-colors"
                    >
                      {collapsedSections.agents ? (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </button>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Agents ({mission.agentIds.length})
                    </h4>
                  </div>
                  {!collapsedSections.agents && (
                    <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                      {agentsLoading ? (
                        <div className="mx-3 px-2 py-1.5 flex items-center gap-2.5">
                          <div className="animate-spin w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full"></div>
                          <span className="text-sm text-muted-foreground">Loading agents...</span>
                        </div>
                      ) : (
                        agents.map((agent, index) => (
                          <div key={agent.id} className="group relative mx-3 px-2 py-1.5 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative flex-shrink-0">
                                <div className="w-9 h-9 rounded-full bg-background border border-border/40 flex items-center justify-center group-hover:border-border/60 transition-all duration-300">
                                  <span className="text-sm">
                                    {getAgentEmoji(agent)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-sm truncate block text-muted-foreground group-hover:text-foreground transition-colors">
                                  {agent.name || `Agent ${index + 1}`}
                                </span>
                                <span className="text-xs text-muted-foreground truncate block">
                                  {agent.description || `ID: ${agent.id}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 group">
                  <button
                    onClick={() => toggleSection('timeline')}
                    className="flex items-center gap-2 hover:text-muted-foreground transition-colors"
                  >
                    {collapsedSections.timeline ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Timeline
                  </h4>
                </div>
                {!collapsedSections.timeline && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                    <div className="group relative mx-3 px-2 py-1.5 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="p-1.5 rounded-md bg-muted/30 group-hover:bg-muted/50 transition-all duration-300">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm truncate block text-muted-foreground group-hover:text-foreground transition-colors">
                            Created
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(mission.createdAt).toLocaleDateString()} at {new Date(mission.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="group relative mx-3 px-2 py-1.5 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="p-1.5 rounded-md bg-muted/30 group-hover:bg-muted/50 transition-all duration-300">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm truncate block text-muted-foreground group-hover:text-foreground transition-colors">
                            Updated
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(mission.updatedAt).toLocaleDateString()} at {new Date(mission.updatedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
}