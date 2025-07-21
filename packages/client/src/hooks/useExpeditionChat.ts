import { useState, useCallback, useRef, useEffect } from 'react';
import { useExpeditionSocket } from './useExpeditionSocket';
import { expeditionAPI } from '@/lib/expeditionApi';

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
  maxMessages = 1000
}: UseExpeditionChatProps): UseExpeditionChatReturn {
  const [messages, setMessages] = useState<ExpeditionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Socket integration for real-time updates
  const { isConnected, error: socketError } = useExpeditionSocket({
    expeditionId,
    onMessage: (data) => {
      console.log('[EXPEDITION CHAT] New message received:', data);
      // Extract the message from the ExpeditionMessageEvent
      const message: ExpeditionMessage = {
        id: data.message.id,
        expeditionId: data.expeditionId,
        role: data.message.role,
        content: data.message.content,
        messageType: 'user-input', // Default to user-input as messageType is not in the event
        timestamp: data.timestamp,
        agentId: data.message.agentId,
        userId: data.message.userId
      };
      
      setMessages(prev => {
        // Avoid duplicates
        const exists = prev.some(msg => msg.id === message.id);
        if (exists) return prev;
        
        const newMessages = [...prev, message];
        // Keep only the latest messages if we exceed maxMessages
        return newMessages.slice(-maxMessages);
      });
    },
    onExpeditionError: (error) => {
      setError(error.error.message || 'Socket error occurred');
    }
  });

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
    agentId?: string
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
        agentId,
        metadata: { sending: true }
      };

      // Add optimistic message to UI
      setMessages(prev => [...prev, optimisticMessage]);

      // Send via API
      const response = await expeditionAPI.sendMessage(starshipId, {
        expeditionId,
        content: content.trim(),
        messageType,
        agentId
      });

      // Create a proper message from the response
      const sentMessage: ExpeditionMessage = {
        id: `sent-${Date.now()}`,
        expeditionId,
        role: 'first-officer',
        content: response.response,
        messageType: 'coordination',
        timestamp: new Date().toISOString()
      };

      // Replace optimistic message with real one
      setMessages(prev =>
        prev.map(msg =>
          msg.id === optimisticMessage.id ? sentMessage : msg
        )
      );

    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev =>
        prev.filter(msg => !msg.id.startsWith('temp-'))
      );
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      console.error('[EXPEDITION CHAT] Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [expeditionId, starshipId]);

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

  // Update error state from socket
  useEffect(() => {
    if (socketError) {
      setError(socketError);
    }
  }, [socketError]);

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