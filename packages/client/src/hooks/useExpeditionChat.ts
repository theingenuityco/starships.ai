import { useState, useCallback, useRef, useEffect } from 'react';
import { expeditionAPI } from '@/lib/expeditionApi';
import { expeditionSocketAPI } from '@/lib/expedition-socket-api';
import { useAuth } from '@/hooks/useAuth';

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

interface UseExpeditionChatProps {
  expeditionId: string;
  starshipId: string;
  autoScroll?: boolean;
  maxMessages?: number;
  enableWebSocket?: boolean;
}

interface UseExpeditionChatReturn {
  messages: ExpeditionMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  sendMessage: (content: string, messageType?: ExpeditionMessage['messageType'], agentId?: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  clearError: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function useExpeditionChat({
  expeditionId,
  starshipId,
  autoScroll = true,
  maxMessages = 1000,
  enableWebSocket = true
}: UseExpeditionChatProps): UseExpeditionChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ExpeditionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Load messages from API
  const refreshMessages = useCallback(async () => {
    if (!expeditionId || !starshipId) return;

    setLoading(true);
    setError(null);

    try {
      const fetchedMessages = await expeditionAPI.getMessages(starshipId, expeditionId);
      // Ensure fetchedMessages is an array before calling slice
      if (Array.isArray(fetchedMessages)) {
        setMessages(fetchedMessages.slice(-maxMessages));
      } else {
        console.warn('[EXPEDITION CHAT] API returned non-array messages:', fetchedMessages);
        setMessages([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load messages';
      setError(errorMessage);
      console.error('[EXPEDITION CHAT] Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [expeditionId, starshipId, maxMessages]);

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    messageType: ExpeditionMessage['messageType'] = 'user-input',
    participantId?: string
  ) => {
    if (!content.trim() || !expeditionId || !starshipId) return;

    setSending(true);
    setError(null);

    try {
      // Create optimistic message
      const optimisticMessage: ExpeditionMessage = {
        id: `temp-${Date.now()}`,
        expeditionId,
        role: 'user',
        content: content.trim(),
        messageType,
        timestamp: new Date().toISOString(),
        agentId: participantId,
        metadata: { sending: true }
      };

      // Add optimistic message to UI
      setMessages(prev => [...prev, optimisticMessage]);

      if (enableWebSocket) {
        // Send via WebSocket
        await expeditionSocketAPI.sendMessage(
          expeditionId,
          content.trim(),
          messageType,
          participantId
        );

        // Note: Keep optimistic message until real message arrives via WebSocket
        // The WebSocket subscription will handle replacing the optimistic message
      } else {
        // Fallback to API
        const response = await expeditionAPI.sendMessage(starshipId, {
          expeditionId,
          content: content.trim(),
          participantId
        });

        // Replace optimistic message with actual user message
        setMessages(prev => {
          const filtered = prev.filter(msg => msg.id !== optimisticMessage.id);
          const newMessages: ExpeditionMessage[] = [];
          
          // Add the actual user message
          if (response.userMessage) {
            newMessages.push(response.userMessage);
          }
          
          // Add the participant response if any
          if (response.participantMessage) {
            newMessages.push(response.participantMessage);
          }
          
          return [...filtered, ...newMessages];
        });
      }

    } catch (err: any) {
      // Remove optimistic message on error
      setMessages(prev =>
        prev.filter(msg => !msg.id.startsWith('temp-'))
      );
      
      let errorMessage = 'Failed to send message';
      
      // Check for timeout error
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        errorMessage = 'Message sending timed out. The server is taking longer than expected to respond. Please try again.';
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('[EXPEDITION CHAT] Failed to send message:', err);
      
      // Add error message to chat to show something went wrong
      const errorMsg: ExpeditionMessage = {
        id: `error-${Date.now()}`,
        expeditionId,
        role: 'system',
        content: errorMessage,
        messageType: 'notification',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }, [expeditionId, starshipId, enableWebSocket]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial load
  useEffect(() => {
    if (expeditionId) {
      refreshMessages();
    }
  }, [expeditionId, refreshMessages]);

  // WebSocket setup for real-time message updates
  useEffect(() => {
    console.log('[EXPEDITION CHAT] 🔧 Setting up WebSocket for real-time updates');
    console.log('[EXPEDITION CHAT] 🔧 enableWebSocket:', enableWebSocket, 'expeditionId:', expeditionId, 'user.id:', user?.id);
    
    if (!enableWebSocket || !expeditionId || !user?.id) {
      console.log('[EXPEDITION CHAT] ❌ WebSocket setup skipped - missing requirements');
      return;
    }

    // Join expedition room
    console.log('[EXPEDITION CHAT] 🚀 Joining expedition room...');
    expeditionSocketAPI.joinExpeditionRoom(expeditionId, user.id);

    // Subscribe to new messages
    const unsubscribeMessages = expeditionSocketAPI.subscribeToMessages(expeditionId, (newMessage) => {
      console.log('[EXPEDITION CHAT] New message via WebSocket:', newMessage);
      
      // Add message to state, replacing optimistic messages if needed
      setMessages(prev => {
        // Check if message already exists (by ID)
        const exists = prev.some(msg => msg.id === newMessage.id);
        if (exists) {
          return prev; // Message already exists, don't duplicate
        }

        // Check if this is a real message that should replace an optimistic one
        const optimisticIndex = prev.findIndex(msg => 
          msg.id.startsWith('temp-') && 
          msg.content === newMessage.content &&
          msg.role === newMessage.role &&
          Math.abs(new Date(msg.timestamp).getTime() - new Date(newMessage.timestamp).getTime()) < 10000 // Within 10 seconds
        );

        if (optimisticIndex !== -1) {
          // Replace optimistic message with real message
          const updated = [...prev];
          updated[optimisticIndex] = newMessage;
          console.log('[EXPEDITION CHAT] Replaced optimistic message with real message');
          return updated;
        } else {
          // Add new message and limit to maxMessages
          const updated = [...prev, newMessage];
          return updated.slice(-maxMessages);
        }
      });
    });

    // Subscribe to streaming events
    const unsubscribeStreaming = expeditionSocketAPI.subscribeToExpedition(expeditionId, (event) => {
      console.log('[EXPEDITION CHAT] Received streaming event:', event.type);
      
      if (event.type === 'expedition:stream-start') {
        console.log('[EXPEDITION CHAT] 🚀 Stream started for participant:', event.agentId);
        
        // Create a placeholder streaming message
        const streamingMessage: ExpeditionMessage = {
          id: `streaming-${event.data.streamId}`,
          expeditionId,
          role: event.agentId === 'first-officer' ? 'first-officer' : 'agent',
          agentId: event.agentId,
          content: '', // Will be filled by chunks
          messageType: event.agentId === 'first-officer' ? 'coordination' : 'task-work',
          timestamp: event.timestamp,
          metadata: { 
            streaming: true, 
            streamId: event.data.streamId,
            isComplete: false 
          }
        };

        setMessages(prev => [...prev, streamingMessage]);
        
      } else if (event.type === 'expedition:stream-chunk') {
        console.log('[EXPEDITION CHAT] ⚡ Stream chunk received:', event.data.content);
        
        // Update the streaming message with new content
        setMessages(prev => prev.map(msg => {
          if (msg.id === `streaming-${event.data.streamId}`) {
            return {
              ...msg,
              content: msg.content + event.data.content
            };
          }
          return msg;
        }));
        
      } else if (event.type === 'expedition:stream-complete') {
        console.log('[EXPEDITION CHAT] ✅ Stream completed');
        
        // Replace streaming message with final message
        setMessages(prev => prev.map(msg => {
          if (msg.id === `streaming-${event.data.streamId}`) {
            return {
              ...event.data.message,
              metadata: { ...event.data.message.metadata, streaming: false, isComplete: true }
            };
          }
          return msg;
        }));
        
      } else if (event.type === 'expedition:stream-error') {
        console.error('[EXPEDITION CHAT] Stream error:', event.data.error);
        
        // Remove streaming message on error
        setMessages(prev => prev.filter(msg => msg.id !== `streaming-${event.data.streamId}`));
      }
    });

    // Cleanup
    return () => {
      unsubscribeMessages();
      unsubscribeStreaming();
      expeditionSocketAPI.leaveExpeditionRoom(expeditionId, user.id);
    };
  }, [enableWebSocket, expeditionId, user?.id, maxMessages]);

  return {
    messages,
    loading,
    error,
    sending,
    sendMessage,
    refreshMessages,
    clearError,
    messagesEndRef
  };
}