import api from '@/lib/api'
import type { ApiResponse, ConversationModel, ConversationSourceType } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Helper to extract data from ApiResponse<T> - enforces response contract
const extractResponseData = <T>(response: AxiosResponse<ApiResponse<T>>): T => response.data.data

// Message interface for client compatibility
export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  conversationId: string
  sending?: boolean
}

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
    queryFn: async () => {
      const response = await api.get(`/api/v1/starships/${starshipId}/conversations`)
      const conversations = extractResponseData<ConversationModel[]>(response)
      return { conversations }
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
      const response = await api.get(`/api/v1/conversations/${conversationId}`)
      return extractResponseData<{
        conversation: ConversationModel
        messages: Message[]
      }>(response)
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
    queryFn: async () => {
      const response = await api.get(`/api/v1/conversations/${conversationId}`, {
        params: { limit: 50, offset: 0 },
      })

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch messages')
      }

      // Convert database messages to client Message format
      const messages = response.data.messages || []
      const formattedMessages = messages.map((dbMsg: any) => ({
        id: dbMsg.id,
        content: dbMsg.content,
        role: dbMsg.role as 'user' | 'assistant',
        timestamp: dbMsg.timestamp,
        conversationId: dbMsg.conversation_id || conversationId,
        ...(dbMsg.structured_content && { structuredContent: dbMsg.structured_content }),
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
    queryFn: async () => {
      const response = await api.get(`/api/v1/users/${userId}/conversations`, {
        params: { active: onlyActive ? 'true' : undefined },
      })
      const conversations = extractResponseData<ConversationModel[]>(response)
      return { conversations }
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
    mutationFn: async (data: { source: ConversationSourceType; agentId?: string; starshipId?: string }) => {
      const response = await api.post('/api/v1/conversations', data)
      return extractResponseData<ConversationModel>(response)
    },
    onSuccess: (conversation, variables) => {
      // Invalidate and refetch relevant conversation lists
      if (variables.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(variables.starshipId),
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
      const response = await api.post(`/api/v1/conversations/${data.conversationId}/messages`, {
        agentId: data.agentId,
        message: data.message,
      })

      // Server returns the response message directly
      return response.data
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

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: Message[] | undefined) => {
        const messages = old || []
        // Remove the temporary sending user message and add both user + assistant messages
        const withoutTempMessage = messages.filter(m => m.id !== context?.userMessage.id)
        const finalUserMessage = { ...context!.userMessage, sending: false }
        return [...withoutTempMessage, finalUserMessage, assistantMessage]
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
      const response = await api.delete(`/api/v1/conversations/${conversationId}/memory`)
      return response.data
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
      const response = await api.delete(`/api/v1/conversations/${conversationId}`)
      return response.data
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
