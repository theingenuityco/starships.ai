import api from '@/lib/api'
import type { ApiResponse, BulkMessageRequest, CreateMessageRequest, MessageModel, UpdateMessageRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Extended Message interface for client compatibility with optimistic updates
export interface ClientMessage extends MessageModel {
  // UI-only states
  sending?: boolean
  streaming?: boolean
  error?: boolean
}

// Message filters for search and filtering
export interface MessageFilters {
  starshipId?: string
  agentId?: string
  memoryId?: string
  conversationId?: string
  role?: 'system' | 'user' | 'assistant'
  messageType?: 'user_input' | 'agent_response' | 'system_message' | 'workflow_output'
  importance?: 'low' | 'medium' | 'high' | 'critical'
  dateFrom?: string
  dateTo?: string
}

// Centralized query keys following TanStack Query best practices
export const MESSAGE_QUERY_KEYS = {
  all: ['messages'] as const,
  lists: () => [...MESSAGE_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: MessageFilters) => [...MESSAGE_QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...MESSAGE_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...MESSAGE_QUERY_KEYS.details(), id] as const,
  byStarship: (starshipId: string) => [...MESSAGE_QUERY_KEYS.all, 'starship', starshipId] as const,
  byAgent: (agentId: string) => [...MESSAGE_QUERY_KEYS.all, 'agent', agentId] as const,
  byConversation: (conversationId: string) => [...MESSAGE_QUERY_KEYS.all, 'conversation', conversationId] as const,
  byMemory: (memoryId: string) => [...MESSAGE_QUERY_KEYS.all, 'memory', memoryId] as const,
  search: (query: string, filters?: MessageFilters) => [...MESSAGE_QUERY_KEYS.all, 'search', query, { filters }] as const,
  thread: (messageId: string) => [...MESSAGE_QUERY_KEYS.detail(messageId), 'thread'] as const,
  stats: (filters?: Omit<MessageFilters, 'role' | 'messageType' | 'importance'>) => [...MESSAGE_QUERY_KEYS.all, 'stats', { filters }] as const,
  conversationAnalytics: (conversationId: string) => [...MESSAGE_QUERY_KEYS.byConversation(conversationId), 'analytics'] as const,
} as const

/**
 * Get message by ID
 */
export function useMessage(messageId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.detail(messageId),
    queryFn: async (): Promise<MessageModel> => {
      const response: AxiosResponse<ApiResponse<MessageModel>> = await api.get(`/api/v1/messages/${messageId}`)
      return response.data.data
    },
    enabled: !!messageId && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get messages by starship
 */
export function useStarshipMessages(starshipId: string, limit: number = 50, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ messages: MessageModel[] }> => {
      const response: AxiosResponse<ApiResponse<{ messages: MessageModel[] }>> = await api.get(`/api/v1/starships/${starshipId}/messages`, {
        params: { limit, page: 1 },
      })
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get messages by agent
 */
export function useAgentMessages(agentId: string, limit: number = 50, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.byAgent(agentId),
    queryFn: async (): Promise<{ messages: MessageModel[] }> => {
      const response: AxiosResponse<ApiResponse<{ messages: MessageModel[] }>> = await api.get(`/api/v1/agents/${agentId}/messages`, {
        params: { limit, page: 1 },
      })
      return response.data.data
    },
    enabled: !!agentId && enabled,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Get messages by conversation
 */
export function useConversationMessages(conversationId: string, limit: number = 100, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.byConversation(conversationId),
    queryFn: async (): Promise<{
      conversationId: string
      messages: MessageModel[]
      total: number
      participants: string[]
      startedAt: string
      lastActivityAt: string
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          conversationId: string
          messages: MessageModel[]
          total: number
          participants: string[]
          startedAt: string
          lastActivityAt: string
        }>
      > = await api.get(`/api/v1/conversations/${conversationId}/messages`, {
        params: { limit, page: 1, orderBy: 'timestamp', orderDirection: 'asc' },
      })
      return response.data.data
    },
    enabled: !!conversationId && enabled,
    staleTime: 5 * 1000, // 5 seconds - messages change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })
}

/**
 * Search messages with advanced filters
 */
export function useSearchMessages(query: string, filters?: MessageFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.search(query, filters),
    queryFn: async (): Promise<{
      messages: MessageModel[]
      total: number
      searchQuery: string
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          messages: MessageModel[]
          total: number
          searchQuery: string
        }>
      > = await api.get('/api/v1/messages/search', {
        params: { query, ...filters, limit: 50, page: 1 },
      })
      return response.data.data
    },
    enabled: !!query && query.trim().length > 0 && enabled,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get message thread (parent-child relationships)
 */
export function useMessageThread(messageId: string, includeParents: boolean = true, includeChildren: boolean = true, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.thread(messageId),
    queryFn: async (): Promise<{
      rootMessage: MessageModel
      thread: MessageModel[]
      totalDepth: number
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          rootMessage: MessageModel
          thread: MessageModel[]
          totalDepth: number
        }>
      > = await api.get(`/api/v1/messages/${messageId}/thread`, {
        params: { includeParents, includeChildren, maxDepth: 20 },
      })
      return response.data.data
    },
    enabled: !!messageId && enabled,
    staleTime: 60 * 1000, // 1 minute - threads don't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Create a new message
 */
export function useCreateMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateMessageRequest): Promise<MessageModel> => {
      const response: AxiosResponse<ApiResponse<MessageModel>> = await api.post('/api/v1/messages', data)
      return response.data.data
    },
    onSuccess: (message, variables) => {
      // Invalidate relevant message lists
      queryClient.invalidateQueries({
        queryKey: MESSAGE_QUERY_KEYS.byStarship(variables.starshipId),
      })

      if (variables.agentId) {
        queryClient.invalidateQueries({
          queryKey: MESSAGE_QUERY_KEYS.byAgent(variables.agentId),
        })
      }

      if (variables.conversationId) {
        queryClient.invalidateQueries({
          queryKey: MESSAGE_QUERY_KEYS.byConversation(variables.conversationId),
        })
      }

      if (variables.memoryId) {
        queryClient.invalidateQueries({
          queryKey: MESSAGE_QUERY_KEYS.byMemory(variables.memoryId),
        })
      }

      // Add to specific caches optimistically
      if (variables.conversationId) {
        queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), (old: any) => {
          if (!old) return { messages: [message], total: 1, conversationId: variables.conversationId }
          return {
            ...old,
            messages: [...old.messages, message],
            total: old.total + 1,
            lastActivityAt: message.timestamp,
          }
        })
      }

      toast.success('Message created successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create message'
      toast.error('Failed to create message', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Send message with optimistic updates (for real-time chat)
 * Supports both regular and streaming modes
 */
export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateMessageRequest & { expectResponse?: boolean; stream?: boolean }): Promise<MessageModel | { streamId: string }> => {
      if (data.stream) {
        // For streaming, POST to conversation messages endpoint to get streamId
        const response: AxiosResponse<ApiResponse<{ streamId: string }>> = await api.post(`/api/v1/conversations/${data.conversationId}/messages`, {
          agentId: data.agentId,
          message: data.content,
          stream: true,
        })
        return response.data.data
      } else {
        // Regular message creation
        const response: AxiosResponse<ApiResponse<MessageModel>> = await api.post('/api/v1/messages', data)
        return response.data.data
      }
    },
    onMutate: async variables => {
      if (!variables.conversationId) return

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: MESSAGE_QUERY_KEYS.byConversation(variables.conversationId),
      })

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId))

      // Optimistically add the message
      const tempMessage: ClientMessage = {
        id: `temp-${Date.now()}`,
        timestamp: new Date().toISOString(),
        role: variables.role,
        content: variables.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        starshipId: variables.starshipId,
        agentId: variables.agentId,
        memoryId: variables.memoryId,
        conversationId: variables.conversationId,
        threadDepth: variables.threadDepth || 0,
        processingStatus: variables.processingStatus || 'pending',
        messageType: variables.messageType || 'user_input',
        importance: variables.importance || 'medium',
        contentLength: variables.content.length,
        hasAttachments: variables.hasAttachments || false,
        sending: true,
        ...(variables.metadata && { metadata: variables.metadata }),
        ...(variables.tokenCount && { tokenCount: variables.tokenCount }),
        ...(variables.processingTimeMs && { processingTimeMs: variables.processingTimeMs }),
      }

      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), (old: any) => {
        if (!old) return { messages: [tempMessage], total: 1, conversationId: variables.conversationId }
        return {
          ...old,
          messages: [...old.messages, tempMessage],
          total: old.total + 1,
        }
      })

      return { previousMessages, tempMessage, conversationId: variables.conversationId }
    },
    onSuccess: (result, variables, context) => {
      if (!variables.conversationId || !context) return

      // For streaming requests, just mark user message as sent - streaming hook handles assistant response
      if (variables.stream && 'streamId' in result) {
        queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), (old: any) => {
          if (!old) return old
          const messages = old.messages.map((msg: ClientMessage) => (msg.id === context.tempMessage.id ? { ...msg, sending: false, id: `user-${Date.now()}` } : msg))
          return { ...old, messages }
        })
        return
      }

      // For regular requests, replace temp message with real message
      const message = result as MessageModel
      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), (old: any) => {
        if (!old) return { messages: [message], total: 1, conversationId: variables.conversationId }

        const messages = old.messages.map((msg: ClientMessage) => (msg.id === context.tempMessage.id ? { ...message, sending: false } : msg))

        return {
          ...old,
          messages,
          lastActivityAt: message.timestamp,
        }
      })

      // Invalidate related caches
      queryClient.invalidateQueries({
        queryKey: MESSAGE_QUERY_KEYS.byStarship(variables.starshipId),
      })
    },
    onError: (error: any, variables, context) => {
      if (!variables.conversationId || !context) return

      // Rollback optimistic update
      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), context.previousMessages)

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message'
      toast.error('Failed to send message', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Update message
 */
export function useUpdateMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, updates }: { messageId: string; updates: UpdateMessageRequest }): Promise<MessageModel> => {
      const response: AxiosResponse<ApiResponse<MessageModel>> = await api.put(`/api/v1/messages/${messageId}`, updates)
      return response.data.data
    },
    onSuccess: (updatedMessage, variables) => {
      // Update the specific message in cache
      queryClient.setQueryData(MESSAGE_QUERY_KEYS.detail(variables.messageId), updatedMessage)

      // Update message in all relevant lists
      if (updatedMessage.conversationId) {
        queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(updatedMessage.conversationId), (old: any) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map((msg: MessageModel) => (msg.id === variables.messageId ? updatedMessage : msg)),
          }
        })
      }

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byStarship(updatedMessage.starshipId) })

      if (updatedMessage.agentId) {
        queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byAgent(updatedMessage.agentId) })
      }

      toast.success('Message updated successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update message'
      toast.error('Failed to update message', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Delete message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const response: AxiosResponse<ApiResponse<any>> = await api.delete(`/api/v1/messages/${messageId}`)
      return response.data.data
    },
    onMutate: async messageId => {
      // Get message details to know which caches to update
      const message = queryClient.getQueryData(MESSAGE_QUERY_KEYS.detail(messageId)) as MessageModel | undefined

      if (message?.conversationId) {
        await queryClient.cancelQueries({
          queryKey: MESSAGE_QUERY_KEYS.byConversation(message.conversationId),
        })

        // Optimistically remove the message
        queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(message.conversationId), (old: any) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.filter((msg: MessageModel) => msg.id !== messageId),
            total: Math.max(0, old.total - 1),
          }
        })
      }

      return { message }
    },
    onSuccess: (data, messageId, context) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: MESSAGE_QUERY_KEYS.detail(messageId) })

      if (context?.message) {
        // Invalidate related caches
        queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byStarship(context.message.starshipId) })

        if (context.message.agentId) {
          queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byAgent(context.message.agentId) })
        }
      }

      toast.success('Message deleted successfully!')
    },
    onError: (error: any, messageId, context) => {
      // Rollback optimistic deletion if we have the message data
      if (context?.message?.conversationId) {
        queryClient.invalidateQueries({
          queryKey: MESSAGE_QUERY_KEYS.byConversation(context.message.conversationId),
        })
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete message'
      toast.error('Failed to delete message', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Bulk operations on messages
 */
export function useBulkMessageOperation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      data: BulkMessageRequest
    ): Promise<{
      processed: number
      failed: number
      errors: Array<{ messageId: string; error: string }>
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          processed: number
          failed: number
          errors: Array<{ messageId: string; error: string }>
        }>
      > = await api.post('/api/v1/messages/bulk', data)
      return response.data.data
    },
    onSuccess: (result, variables) => {
      // Invalidate all message caches since we don't know which ones were affected
      queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.all })

      const { processed, failed } = result
      if (failed === 0) {
        toast.success(`Successfully processed ${processed} messages`)
      } else {
        toast.warning(`Processed ${processed} messages, ${failed} failed`)
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Bulk operation failed'
      toast.error('Bulk operation failed', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Get message statistics
 */
export function useMessageStats(filters?: Omit<MessageFilters, 'role' | 'messageType' | 'importance'>, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.stats(filters),
    queryFn: async (): Promise<{
      total: number
      byRole: { system: number; user: number; assistant: number }
      byType: Record<string, number>
      byImportance: Record<string, number>
      averageContentLength: number
      averageProcessingTime?: number
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          total: number
          byRole: { system: number; user: number; assistant: number }
          byType: Record<string, number>
          byImportance: Record<string, number>
          averageContentLength: number
          averageProcessingTime?: number
        }>
      > = await api.get('/api/v1/messages/stats', {
        params: filters,
      })
      return response.data.data
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })
}

/**
 * Get conversation analytics
 */
export function useConversationAnalytics(conversationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: MESSAGE_QUERY_KEYS.conversationAnalytics(conversationId),
    queryFn: async (): Promise<{
      conversationId: string
      totalMessages: number
      messagesByRole: { system: number; user: number; assistant: number }
      averageMessageLength: number
      totalTokens: number
      averageTokensPerMessage: number
      totalProcessingTime: number
      averageProcessingTime: number
      participantCount: number
      participants: string[]
      startedAt: string
      lastActivityAt: string
      duration: number
    }> => {
      const response: AxiosResponse<
        ApiResponse<{
          conversationId: string
          totalMessages: number
          messagesByRole: { system: number; user: number; assistant: number }
          averageMessageLength: number
          totalTokens: number
          averageTokensPerMessage: number
          totalProcessingTime: number
          averageProcessingTime: number
          participantCount: number
          participants: string[]
          startedAt: string
          lastActivityAt: string
          duration: number
        }>
      > = await api.get(`/api/v1/conversations/${conversationId}/analytics`)
      return response.data.data
    },
    enabled: !!conversationId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Utility hook for managing message filters with local storage
 */
export function useMessageFilters() {
  const setFilters = (filters: MessageFilters) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('messageFilters', JSON.stringify(filters))
    }
  }

  const getFilters = (): MessageFilters | null => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('messageFilters')
      return stored ? JSON.parse(stored) : null
    }
    return null
  }

  const clearFilters = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('messageFilters')
    }
  }

  return {
    setFilters,
    getFilters,
    clearFilters,
  }
}

/**
 * Utility hook for real-time message updates (WebSocket integration point)
 */
export function useRealTimeMessages(conversationId?: string) {
  const queryClient = useQueryClient()

  // This would integrate with WebSocket for real-time updates
  const handleMessageReceived = (message: MessageModel) => {
    if (message.conversationId) {
      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(message.conversationId), (old: any) => {
        if (!old) return { messages: [message], total: 1, conversationId: message.conversationId }

        // Check if message already exists to avoid duplicates
        const exists = old.messages.some((msg: MessageModel) => msg.id === message.id)
        if (exists) return old

        return {
          ...old,
          messages: [...old.messages, message],
          total: old.total + 1,
          lastActivityAt: message.timestamp,
        }
      })

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byStarship(message.starshipId) })
    }
  }

  return {
    handleMessageReceived,
  }
}
