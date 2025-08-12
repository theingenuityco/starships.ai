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
import type { Mission, MissionStatus, MissionMessage, Agent, MissionClarity } from '@starships/protocol';

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
  
  // Clarity state
  const [clarity, setClarity] = useState<MissionClarity | null>(null);
  const [clarityLoading, setClarityLoading] = useState(true);
  const [clarityUpdated, setClarityUpdated] = useState(false);
  
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
    agents: false,
    progress: false,
    clarity: false
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

  // Function to get current phase information
  const getCurrentPhase = (currentPhase: string) => {
    const phases = {
      'init': { label: 'Init', description: 'Setting up mission context' },
      'welcome': { label: 'Welcome', description: 'Mission introduction' },
      'analysis': { label: 'Analysis', description: 'Analyzing mission clarity' },
      'converse': { label: 'Converse', description: 'Active conversation phase' }
    };

    return phases[currentPhase as keyof typeof phases] || { label: currentPhase, description: 'Current phase' };
  };

  // Central message handler - single source of truth
  const addMessageToUI = (message: MissionMessage) => {
    setMessages(prev => [...prev, message]);
  };

  // WebSocket setup for mission messages and real-time updates
  useEffect(() => {
    if (!isConnected || !socketClient) return;

    const handleMissionMessage = (data: any) => {
      console.log('[MISSION] Received WebSocket message:', data);
      if (data.message && data.missionId === missionId) {
        addMessageToUI(data.message);
      }
    };

    const handleClarityUpdate = (data: any) => {
      console.log('[MISSION] Received clarity update:', data);
      if (data.missionId === missionId && data.clarity) {
        setClarity(data.clarity);
        setClarityUpdated(true);
        // Remove the update indicator after 3 seconds
        setTimeout(() => setClarityUpdated(false), 3000);
      }
    };

    const handlePhaseChange = (data: any) => {
      console.log('[MISSION] Received phase change:', data);
      if (data.missionId === missionId) {
        setMission(prev => prev ? { ...prev, phase: data.newPhase } : null);
      }
    };

    const handleStatusChange = (data: any) => {
      console.log('[MISSION] Received status change:', data);
      if (data.missionId === missionId) {
        setMission(prev => prev ? { ...prev, status: data.newStatus } : null);
      }
    };

    // Listen for mission events
    socketClient.on('mission:message-sent', handleMissionMessage);
    socketClient.on('mission:clarity-updated', handleClarityUpdate);
    socketClient.on('mission:phase-changed', handlePhaseChange);
    socketClient.on('mission:status-changed', handleStatusChange);

    // Join mission room for real-time updates
    socketClient.emit('mission:join-room', missionId);

    return () => {
      socketClient.off('mission:message-sent', handleMissionMessage);
      socketClient.off('mission:clarity-updated', handleClarityUpdate);
      socketClient.off('mission:phase-changed', handlePhaseChange);
      socketClient.off('mission:status-changed', handleStatusChange);
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

  // Fetch clarity data
  const loadClarity = async () => {
    try {
      setClarityLoading(true);
      const response = await missionApi.getMissionClarity(missionId);
      if (response.data) {
        setClarity(response.data);
      } else {
        setClarity(null);
      }
    } catch (error) {
      console.error('Failed to load clarity:', error);
      setClarity(null);
    } finally {
      setClarityLoading(false);
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

          // Load clarity data
          await loadClarity();
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
              
              {/* Current Phase Section */}
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
                    Current Phase
                  </h4>
                </div>
                {!collapsedSections.progress && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                    <div className="group relative mx-3 px-2 py-1 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="p-1.5 rounded-md bg-primary/20 transition-all duration-300">
                            <div className="w-3.5 h-3.5 flex items-center justify-center">
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm truncate block text-primary transition-colors leading-tight">
                            {getCurrentPhase(mission.phase).label}
                          </span>
                          <span className="text-xs text-muted-foreground leading-tight">
                            {getCurrentPhase(mission.phase).description}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mission Clarity Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 group">
                  <button
                    onClick={() => toggleSection('clarity')}
                    className="flex items-center gap-2 hover:text-muted-foreground transition-colors"
                  >
                    {collapsedSections.clarity ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Mission Clarity
                  </h4>
                  <div className="ml-auto flex items-center gap-1">
                    {clarity ? (
                      <>
                        <div className={`h-2 w-2 rounded-full transition-all duration-300 ${
                          clarityUpdated ? 'animate-pulse ring-2 ring-blue-400' : ''
                        } ${
                          clarity.overallScore >= 8 ? 'bg-green-500' :
                          clarity.overallScore >= 6 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                        <span className={`text-xs font-medium transition-colors ${
                          clarityUpdated ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                        }`}>
                          {clarity.overallScore.toFixed(1)}/10
                        </span>
                        {clarityUpdated && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 animate-fade-in">
                            ✨ Updated
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse" />
                        <span className="text-xs font-medium text-muted-foreground/60">
                          Pending
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {!collapsedSections.clarity && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {clarity ? (
                      <>
                        {/* Overall Score */}
                        <div className="group relative mx-3 px-2 py-1.5 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative flex-shrink-0">
                              <div className={`p-1.5 rounded-md transition-all duration-300 ${
                                clarity.overallScore >= 8 ? 'bg-green-500/20' :
                                clarity.overallScore >= 6 ? 'bg-yellow-500/20' :
                                'bg-red-500/20'
                              }`}>
                                <div className="w-3.5 h-3.5 flex items-center justify-center">
                                  <span className={`text-xs font-bold ${
                                    clarity.overallScore >= 8 ? 'text-green-600 dark:text-green-400' :
                                    clarity.overallScore >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                                    'text-red-600 dark:text-red-400'
                                  }`}>
                                    {clarity.overallScore.toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-sm truncate block text-foreground transition-colors leading-tight">
                                Overall Score
                              </span>
                              <span className="text-xs text-muted-foreground leading-tight">
                                Iteration {clarity.iteration} • {
                                  clarity.overallScore >= 8 ? 'Excellent' :
                                  clarity.overallScore >= 6 ? 'Good' :
                                  'Needs Improvement'
                                }
                              </span>
                            </div>
                          </div>
                        </div>

                      {/* 5-Dimension Breakdown */}
                      {[
                        { key: 'objectiveClarity', label: 'Objective Clarity', score: clarity.objectiveClarity },
                        { key: 'successMetrics', label: 'Success Metrics', score: clarity.successMetrics },
                        { key: 'timelineDefinition', label: 'Timeline Definition', score: clarity.timelineDefinition },
                        { key: 'scopeBoundaries', label: 'Scope Boundaries', score: clarity.scopeBoundaries },
                        { key: 'visionAlignment', label: 'Vision Alignment', score: clarity.visionAlignment }
                      ].map((dimension) => (
                        <div key={dimension.key} className="group relative mx-3 px-2 py-1 rounded-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative flex-shrink-0">
                              <div className="w-6 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${
                                    dimension.score >= 8 ? 'bg-green-500' :
                                    dimension.score >= 6 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`}
                                  style={{ width: `${(dimension.score / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-xs truncate block text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                                {dimension.label}
                              </span>
                            </div>
                            <div className="flex-shrink-0">
                              <span className={`text-xs font-medium ${
                                dimension.score >= 8 ? 'text-green-600 dark:text-green-400' :
                                dimension.score >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                                {dimension.score}/10
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                        {/* AI Reasoning */}
                        {clarity.reasoning && (
                          <div className="group relative mx-3 px-3 py-2 rounded-lg bg-muted/20 border-l-2 border-blue-500/30 transition-all duration-300">
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-xs text-blue-600 dark:text-blue-400 leading-tight mb-1.5">
                                Reasoning:
                              </span>
                              <blockquote className="text-xs text-muted-foreground leading-relaxed italic border-l-2 border-muted/40 pl-2">
                                "{clarity.reasoning}"
                              </blockquote>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Empty State */
                      <div className="mx-3 px-3 py-4 rounded-lg bg-muted/10 border border-dashed border-muted/30 transition-all duration-300">
                        <div className="text-center">
                          <div className="flex justify-center mb-2">
                            <div className="h-8 w-8 rounded-full bg-muted/20 flex items-center justify-center">
                              <div className="h-3 w-3 rounded-full bg-muted-foreground/30 animate-pulse" />
                            </div>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground block mb-1">
                            Clarity Assessment Pending
                          </span>
                          <p className="text-xs text-muted-foreground/70 leading-relaxed">
                            Mission clarity will be evaluated during your conversation with the orchestrator
                          </p>
                        </div>
                      </div>
                    )}
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