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
          
          // Load chat history
          const historyResponse = await missionApi.getMessageHistory(missionId);
          if (historyResponse.data) {
            setMessages(historyResponse.data.messages);
          }
          
          // Initialize chat if no messages exist
          if (!historyResponse.data?.messages.length) {
            const initResponse = await missionApi.initializeChat(missionId);
            if (initResponse.data?.greeting) {
              const greetingMessage: MissionMessage = {
                id: `greeting-${Date.now()}`,
                missionId,
                role: 'orchestrator',
                content: initResponse.data.greeting.reply,
                timestamp: new Date().toISOString(),
                senderName: 'Mission Orchestrator'
              };
              setMessages([greetingMessage]);
            }
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

    const userMessage: MissionMessage = {
      id: `user-${Date.now()}`,
      missionId,
      role: 'user',
      content: newMessage,
      timestamp: new Date().toISOString(),
      senderName: 'You'
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setChatLoading(true);

    try {
      const response = await missionApi.sendMessage(missionId, newMessage);
      
      if (response.data) {
        const orchestratorMessage: MissionMessage = {
          id: `orchestrator-${Date.now()}`,
          missionId,
          role: 'orchestrator',
          content: response.data.reply,
          timestamp: new Date().toISOString(),
          senderName: 'Mission Orchestrator'
        };
        setMessages(prev => [...prev, orchestratorMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
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
    <div className="h-full command-deck-bg p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Missions
          </Button>
          <div className="flex items-center gap-2">
            {statusIcons[mission.status]}
            <h1 className="text-3xl font-bold">{mission.name}</h1>
            <Badge className={statusColors[mission.status]}>
              {mission.status}
            </Badge>
          </div>
        </div>

        {/* Mission Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Mission Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{mission.description}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(mission.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Last Updated</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(mission.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Assigned Agents</p>
                  <p className="text-sm text-muted-foreground">
                    {mission.agentIds?.length || 0} agent{(mission.agentIds?.length || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat Interface */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Mission Orchestrator</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col h-96">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted text-muted-foreground px-4 py-2 rounded-lg">
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
            <div className="flex space-x-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask the orchestrator..."
                disabled={chatLoading}
              />
              <Button onClick={handleSendMessage} disabled={chatLoading || !newMessage.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}