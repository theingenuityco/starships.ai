import api from '@/lib/api'
import type { Message } from '@/types/chat'
import type { ApiResponse, ConversationModel, ConversationSourceType } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Centralized query keys
export const CONVERSATION_QUERY_KEYS = {
  all: ['conversations'] as const,
  lists: () => [...CONVERSATION_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: any) => [...CONVERSATION_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...CONVERSATION_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...CONVERSATION_QUERY_KEYS.details(), id] as const,
  byStarship: (starshipId: string) => [...CONVERSATION_QUERY_KEYS.all, 'starship', starshipId] as const,
  byUser: (userId: string) => [...CONVERSATION_QUERY_KEYS.all, 'user', userId] as const,
  messages: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'messages'] as const,
} as const

// Get conversations by starship ID
export function useStarshipConversations(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ conversations: ConversationModel[] }> => {
      const response: AxiosResponse<ApiResponse<ConversationModel[]>> = await api.get(`/api/v1/starships/${starshipId}/conversations`)
      return { conversations: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

// Get conversation details with messages
export function useConversation(conversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId),
    queryFn: async () => {
      const response: AxiosResponse<ApiResponse<ConversationModel & { messages: any[] }>> = await api.get(`/api/v1/conversations/${conversationId}`)
      const data = response.data.data

      return {
        conversation: {
          id: data.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          lastActivityAt: data.lastActivityAt,
          messageCount: data.messageCount,
          totalTokens: data.totalTokens,
          status: data.status,
          metadata: data.metadata,
          // Handle optional relationship fields safely
          starshipId: (data as any).starshipId,
          userId: (data as any).userId,
        },
        messages: data.messages.map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          timestamp: msg.timestamp,
          conversationId: msg.conversationId || conversationId,
        })),
      }
    },
    enabled: !!conversationId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Get messages for a conversation
export function useConversationMessages(conversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId),
    queryFn: async (): Promise<{ messages: Message[] }> => {
      const response: AxiosResponse<ApiResponse<{ messages: any[] }>> = await api.get(`/api/v1/conversations/${conversationId}`, {
        params: { limit: 50, offset: 0 },
      })

      const data = response.data.data
      const messages = data.messages || []
      const formattedMessages = messages.map((dbMsg: any) => ({
        id: dbMsg.id,
        content: dbMsg.content,
        role: dbMsg.role as 'user' | 'assistant' | 'system',
        timestamp: dbMsg.timestamp,
        conversationId: dbMsg.conversation_id || conversationId,
        agentId: dbMsg.agentId,

        // Enhanced backend properties
        messageType: dbMsg.messageType,
        importance: dbMsg.importance,
        processingStatus: dbMsg.processingStatus,
        processingTimeMs: dbMsg.processingTimeMs,
        tokenCount: dbMsg.tokenCount,
        hasAttachments: dbMsg.hasAttachments,
        contentLength: dbMsg.contentLength,

        // Threading support
        parentMessageId: dbMsg.parentMessageId,
        threadDepth: dbMsg.threadDepth || 0,

        // Additional metadata
        metadata: dbMsg.metadata,
        processingMetadata: dbMsg.processingMetadata,
        contentHash: dbMsg.contentHash,
      }))

      return { messages: formattedMessages }
    },
    enabled: !!conversationId && enabled,
    staleTime: 5 * 1000, // 5 seconds - messages change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

// Get conversations for a user
export function useUserConversations(userId: string, onlyActive: boolean = false, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.byUser(userId),
    queryFn: async (): Promise<{ conversations: ConversationModel[] }> => {
      const response: AxiosResponse<ApiResponse<ConversationModel[]>> = await api.get(`/api/v1/users/${userId}/conversations`, {
        params: { active: onlyActive ? 'true' : undefined },
      })
      return { conversations: response.data.data }
    },
    enabled: !!userId && enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Create a new conversation
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { source: ConversationSourceType; metadata?: Record<string, unknown>; starshipId?: string; userId?: string }): Promise<ConversationModel> => {
      const response: AxiosResponse<ApiResponse<ConversationModel>> = await api.post('/api/v1/conversations', data)
      return response.data.data
    },
    onSuccess: (conversation, variables) => {
      // Invalidate and refetch relevant conversation lists
      if (variables.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(variables.starshipId),
        })
      }

      if (variables.userId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byUser(variables.userId),
        })
      }

      // Add new conversation to cache optimistically
      if (variables.starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(variables.starshipId), (old: { conversations: ConversationModel[] } | undefined) => {
          if (!old) return { conversations: [conversation] }
          // Add to beginning (most recent)
          return {
            ...old,
            conversations: [conversation, ...old.conversations],
          }
        })
      }

      toast.success('New conversation created successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create conversation'
      toast.error('Failed to create conversation', {
        description: errorMessage,
      })
    },
  })
}

// Send message to conversation
export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { conversationId: string; agentId: string; message: string }) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.post(`/api/v1/conversations/${data.conversationId}/messages`, {
        agentId: data.agentId,
        message: data.message,
      })
      return response.data.data
    },
    onMutate: async ({ conversationId, message }) => {
      // Cancel any outgoing refetches for conversation messages
      await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId))

      // Optimistically add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        content: message,
        role: 'user',
        timestamp: new Date().toISOString(),
        conversationId,
        sending: true,
      }

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: { messages: Message[] } | undefined) => {
        const messages = old?.messages || []
        return { messages: [...messages, userMessage] }
      })

      return { previousMessages, userMessage, conversationId }
    },
    onSuccess: (response, variables, context) => {
      // Convert server response to Message format
      const assistantMessage: Message = {
        id: `response-${Date.now()}`,
        content: response.reply || response.content || 'No response',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        conversationId: variables.conversationId,
      }

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: { messages: Message[] } | undefined) => {
        const messages = old?.messages || []
        // Remove the temporary sending user message and add both user + assistant messages
        const withoutTempMessage = messages.filter(m => m.id !== context?.userMessage.id)
        const finalUserMessage = { ...context!.userMessage, sending: false }
        return { messages: [...withoutTempMessage, finalUserMessage, assistantMessage] }
      })

      // Update conversation activity
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId) })
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), context.previousMessages)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message'
      toast.error('Failed to send message', {
        description: errorMessage,
      })
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(variables.conversationId) })
    },
  })
}

// Clear conversation memory
export function useClearConversationMemory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.delete(`/api/v1/conversations/${conversationId}/memory`)
      return response.data.data
    },
    onSuccess: (data, conversationId) => {
      // Invalidate conversation details and messages
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId) })
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })

      toast.success('Conversation memory cleared successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to clear conversation memory'
      toast.error('Failed to clear memory', {
        description: errorMessage,
      })
    },
  })
}

// Delete conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.delete(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    onMutate: async conversationId => {
      // Get conversation details to know which starship it belongs to
      const conversationData = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId)) as any
      const starshipId = conversationData?.conversation?.starshipId

      // Cancel any outgoing refetches
      if (starshipId) {
        await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId) })
      }

      // Snapshot the previous conversations
      const previousConversations = starshipId ? queryClient.getQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId)) : null

      // Optimistically remove the conversation
      if (starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId), (old: { conversations: ConversationModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.filter((conversation: ConversationModel) => conversation.id !== conversationId),
          }
        })
      }

      return { previousConversations, conversationId, starshipId }
    },
    onError: (error: any, conversationId, context) => {
      // Rollback the optimistic update
      if (context?.previousConversations && context.starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(context.starshipId), context.previousConversations)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete conversation'
      toast.error('Failed to delete conversation', {
        description: errorMessage,
      })
    },
    onSuccess: (data, conversationId, context) => {
      // Remove the conversation from all caches
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId) })
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })

      toast.success('Conversation deleted successfully!')
    },
    onSettled: (data, error, conversationId, context) => {
      // Always refetch to ensure consistency
      if (context?.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(context.starshipId),
        })
      }
    },
  })
}

// Update conversation status
export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { conversationId: string; status: 'active' | 'paused' | 'completed' | 'archived' }) => {
      const response: AxiosResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${data.conversationId}/status`, {
        status: data.status,
      })
      return response.data.data
    },
    onSuccess: (updatedConversation, variables) => {
      // Update the conversation in cache
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), (old: any) => {
        if (!old) return old
        return {
          ...old,
          conversation: updatedConversation,
        }
      })

      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId) })

      if (updatedConversation.starshipId) {
        queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(updatedConversation.starshipId) })
      }

      toast.success(`Conversation ${variables.status} successfully!`)
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update conversation status'
      toast.error('Failed to update status', {
        description: errorMessage,
      })
    },
  })
}

// Utility hook for managing active conversation selection with local storage
export function useActiveConversation() {
  const setActiveConversation = (conversationId: string | null) => {
    if (conversationId) {
      localStorage.setItem('activeConversationId', conversationId)
    } else {
      localStorage.removeItem('activeConversationId')
    }
  }

  const getActiveConversationId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeConversationId')
    }
    return null
  }

  return {
    setActiveConversation,
    getActiveConversationId,
    clearActiveConversation: () => setActiveConversation(null),
  }
}
