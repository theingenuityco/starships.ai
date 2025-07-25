import { useState, useCallback, useRef, useEffect } from 'react';
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

  // NOTE: Socket functionality removed - now HTTP-only
  // Real-time updates are no longer available

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

      // Send via API with participantId
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

  // Socket error handling removed - HTTP-only mode

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