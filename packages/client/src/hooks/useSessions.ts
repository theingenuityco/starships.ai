import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { AxiosResponse } from 'axios';
import type {
  ApiResponse,
  SessionModel,
  SessionSourceType
} from '@starships/protocol';

// Helper to extract data from ApiResponse<T> - enforces response contract
const extractResponseData = <T>(response: AxiosResponse<ApiResponse<T>>): T => response.data.data;

// Message interface for client compatibility
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  sending?: boolean;
}

// Centralized query keys
export const SESSION_QUERY_KEYS = {
  all: ['sessions'] as const,
  lists: () => [...SESSION_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: any) => [...SESSION_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...SESSION_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...SESSION_QUERY_KEYS.details(), id] as const,
  byStarship: (starshipId: string) => [...SESSION_QUERY_KEYS.all, 'starship', starshipId] as const,
  byUser: (userId: string) => [...SESSION_QUERY_KEYS.all, 'user', userId] as const,
  messages: (sessionId: string) => [...SESSION_QUERY_KEYS.detail(sessionId), 'messages'] as const,
} as const;

// Get sessions by starship ID
export function useStarshipSessions(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: SESSION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async () => {
      const response = await api.get(`/api/v1/starships/${starshipId}/sessions`);
      const sessions = extractResponseData<SessionModel[]>(response);
      return { sessions };
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

// Get session details with messages
export function useSession(sessionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: SESSION_QUERY_KEYS.detail(sessionId),
    queryFn: async () => {
      const response = await api.get(`/api/v1/sessions/${sessionId}`);
      return extractResponseData<{
        session: SessionModel;
        messages: Message[];
      }>(response);
    },
    enabled: !!sessionId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get messages for a session
export function useSessionMessages(sessionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: SESSION_QUERY_KEYS.messages(sessionId),
    queryFn: async () => {
      const response = await api.get(`/api/v1/sessions/${sessionId}`, {
        params: { limit: 50, offset: 0 }
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch messages');
      }

      // Convert database messages to client Message format
      const messages = response.data.messages || [];
      const formattedMessages = messages.map((dbMsg: any) => ({
        id: dbMsg.id,
        content: dbMsg.content,
        role: dbMsg.role as 'user' | 'assistant',
        timestamp: dbMsg.timestamp,
        sessionId: dbMsg.session_id || sessionId,
        ...(dbMsg.structured_content && { structuredContent: dbMsg.structured_content })
      }));
      
      return { messages: formattedMessages };
    },
    enabled: !!sessionId && enabled,
    staleTime: 5 * 1000, // 5 seconds - messages change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

// Get sessions for a user
export function useUserSessions(userId: string, onlyActive: boolean = false, enabled: boolean = true) {
  return useQuery({
    queryKey: SESSION_QUERY_KEYS.byUser(userId),
    queryFn: async () => {
      const response = await api.get(`/api/v1/users/${userId}/sessions`, {
        params: { active: onlyActive ? 'true' : undefined }
      });
      const sessions = extractResponseData<SessionModel[]>(response);
      return { sessions };
    },
    enabled: !!userId && enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create a new session
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      source: SessionSourceType;
      agentId?: string;
      starshipId?: string;
    }) => {
      const response = await api.post('/api/v1/sessions', data);
      return extractResponseData<SessionModel>(response);
    },
    onSuccess: (session, variables) => {
      // Invalidate and refetch relevant session lists
      if (variables.starshipId) {
        queryClient.invalidateQueries({ 
          queryKey: SESSION_QUERY_KEYS.byStarship(variables.starshipId) 
        });
      }
      
      // Add new session to cache optimistically
      if (variables.starshipId) {
        queryClient.setQueryData(
          SESSION_QUERY_KEYS.byStarship(variables.starshipId),
          (old: { sessions: SessionModel[] } | undefined) => {
            if (!old) return { sessions: [session] };
            // Add to beginning (most recent)
            return {
              ...old,
              sessions: [session, ...old.sessions]
            };
          }
        );
      }

      toast.success('New session created successfully!');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create session';
      toast.error('Failed to create session', {
        description: errorMessage
      });
    }
  });
}

// Send message to session
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sessionId: string;
      agentId: string;
      message: string;
    }) => {
      const response = await api.post(`/api/v1/sessions/${data.sessionId}/messages`, {
        agentId: data.agentId,
        message: data.message
      });
      
      // Server returns the response message directly
      return response.data;
    },
    onMutate: async ({ sessionId, message }) => {
      // Cancel any outgoing refetches for session messages
      await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEYS.messages(sessionId) });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(SESSION_QUERY_KEYS.messages(sessionId));

      // Optimistically add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        content: message,
        role: 'user',
        timestamp: new Date().toISOString(),
        sessionId,
        sending: true
      };

      queryClient.setQueryData(SESSION_QUERY_KEYS.messages(sessionId), (old: { messages: Message[] } | undefined) => {
        const messages = old?.messages || [];
        return { messages: [...messages, userMessage] };
      });

      return { previousMessages, userMessage, sessionId };
    },
    onSuccess: (response, variables, context) => {
      // Convert server response to Message format
      const assistantMessage: Message = {
        id: `response-${Date.now()}`,
        content: response.reply || response.content || 'No response',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        sessionId: variables.sessionId
      };

      queryClient.setQueryData(SESSION_QUERY_KEYS.messages(variables.sessionId), (old: Message[] | undefined) => {
        const messages = old || [];
        // Remove the temporary sending user message and add both user + assistant messages
        const withoutTempMessage = messages.filter(m => m.id !== context?.userMessage.id);
        const finalUserMessage = { ...context!.userMessage, sending: false };
        return [...withoutTempMessage, finalUserMessage, assistantMessage];
      });

      // Update session activity
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEYS.detail(variables.sessionId) });
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(SESSION_QUERY_KEYS.messages(variables.sessionId), context.previousMessages);
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message';
      toast.error('Failed to send message', {
        description: errorMessage
      });
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEYS.messages(variables.sessionId) });
    }
  });
}

// Clear session memory
export function useClearSessionMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await api.delete(`/api/v1/sessions/${sessionId}/memory`);
      return response.data;
    },
    onSuccess: (data, sessionId) => {
      // Invalidate session details and messages
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEYS.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEYS.messages(sessionId) });

      toast.success('Session memory cleared successfully!');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to clear session memory';
      toast.error('Failed to clear memory', {
        description: errorMessage
      });
    }
  });
}

// Delete session
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await api.delete(`/api/v1/sessions/${sessionId}`);
      return response.data;
    },
    onMutate: async (sessionId) => {
      // Get session details to know which starship it belongs to
      const sessionData = queryClient.getQueryData(SESSION_QUERY_KEYS.detail(sessionId)) as any;
      const starshipId = sessionData?.session?.starshipId;

      // Cancel any outgoing refetches
      if (starshipId) {
        await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEYS.byStarship(starshipId) });
      }

      // Snapshot the previous sessions
      const previousSessions = starshipId ? 
        queryClient.getQueryData(SESSION_QUERY_KEYS.byStarship(starshipId)) : null;

      // Optimistically remove the session
      if (starshipId) {
        queryClient.setQueryData(SESSION_QUERY_KEYS.byStarship(starshipId), (old: { sessions: SessionModel[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            sessions: old.sessions.filter((session: SessionModel) => session.id !== sessionId)
          };
        });
      }

      return { previousSessions, sessionId, starshipId };
    },
    onError: (error: any, sessionId, context) => {
      // Rollback the optimistic update
      if (context?.previousSessions && context.starshipId) {
        queryClient.setQueryData(SESSION_QUERY_KEYS.byStarship(context.starshipId), context.previousSessions);
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete session';
      toast.error('Failed to delete session', {
        description: errorMessage
      });
    },
    onSuccess: (data, sessionId, context) => {
      // Remove the session from all caches
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEYS.detail(sessionId) });
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEYS.messages(sessionId) });

      toast.success('Session deleted successfully!');
    },
    onSettled: (data, error, sessionId, context) => {
      // Always refetch to ensure consistency
      if (context?.starshipId) {
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEYS.byStarship(context.starshipId) });
      }
    }
  });
}

// Utility hook for managing active session selection with local storage
export function useActiveSession() {
  const setActiveSession = (sessionId: string | null) => {
    if (sessionId) {
      localStorage.setItem('activeSessionId', sessionId);
    } else {
      localStorage.removeItem('activeSessionId');
    }
  };

  const getActiveSessionId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeSessionId');
    }
    return null;
  };

  return {
    setActiveSession,
    getActiveSessionId,
    clearActiveSession: () => setActiveSession(null),
  };
}