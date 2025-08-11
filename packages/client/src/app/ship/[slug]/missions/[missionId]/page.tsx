'use client';

import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, Users, Clock, Calendar, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { missionApi } from '@/lib/missionApi';
import { starshipAPI } from '@/lib/api';
import { useSocket } from '@/providers/socket-provider';
import SocketClient from '@/lib/socket-client';
import type { Mission, MissionStatus, MissionMessage } from '@starships/protocol';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<MissionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket state
  const { isConnected } = useSocket();
  const socketClient = SocketClient.getInstance();

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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


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
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-muted/30 flex-shrink-0">
          <div className="p-4 lg:p-6 space-y-4 lg:space-y-6 h-full overflow-y-auto">
            {/* Status Card */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                {statusIcons[mission.status]}
                <h3 className="font-semibold">Status</h3>
              </div>
              <Badge className={`${statusColors[mission.status]} text-xs`}>
                {mission.status.toUpperCase()}
              </Badge>
            </Card>

            {/* Quick Info */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Quick Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Created</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(mission.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Updated</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(mission.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Agents</p>
                    <p className="text-muted-foreground text-xs">
                      {mission.agentIds?.length || 0} assigned
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Mission Description */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {mission.description}
              </p>
            </Card>

            {/* Quick Actions */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Actions</h3>
              <div className="space-y-2">
                {mission.status === 'draft' && (
                  <Button size="sm" className="w-full justify-start">
                    <Target className="w-4 h-4 mr-2" />
                    Start Mission
                  </Button>
                )}
                {mission.status === 'active' && (
                  <Button size="sm" variant="outline" className="w-full justify-start">
                    <Clock className="w-4 h-4 mr-2" />
                    Pause Mission
                  </Button>
                )}
                <Button size="sm" variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Agents
                </Button>
              </div>
            </Card>

            {/* Agent Status */}
            {mission.agentIds && mission.agentIds.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Agent Status</h3>
                <div className="space-y-2 text-sm">
                  {mission.agentIds.map((agentId, index) => (
                    <div key={agentId} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Agent {index + 1}</span>
                      <span className="text-xs text-muted-foreground ml-auto">Online</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}